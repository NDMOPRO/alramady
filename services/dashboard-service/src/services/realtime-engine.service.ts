import { PrismaClient } from '@prisma/client';
import { Server as SocketIOServer, Socket } from 'socket.io';
import IORedis from 'ioredis';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

// ─── Interfaces ──────────────────────────────────────────────────────
interface DashboardConnection {
  socketId: string;
  userId: string;
  dashboardId: string;
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: string[];
  metadata: Record<string, unknown>;
}

interface StreamConfig {
  id: string;
  dashboardId: string;
  widgetId: string;
  dataSourceId: string;
  refreshInterval: number;
  query: string;
  aggregation?: AggregationConfig;
  filters: FilterConfig[];
  maxDataPoints: number;
  enabled: boolean;
}

interface AggregationConfig {
  type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'last' | 'first';
  field: string;
  groupBy?: string;
  timeWindow?: number;
}

interface FilterConfig {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';
  value: unknown;
}

interface DataUpdate {
  streamId: string;
  widgetId: string;
  dashboardId: string;
  data: Record<string, unknown>[];
  timestamp: Date;
  metadata: { rowCount: number; queryTime: number; cached: boolean };
}

interface RefreshSchedule {
  id: string;
  dashboardId: string;
  interval: number;
  lastRefresh: Date;
  nextRefresh: Date;
  enabled: boolean;
  timerId?: NodeJS.Timeout;
}

interface ChannelSubscription {
  channel: string;
  dashboardId: string;
  widgetIds: string[];
  handler: (message: string) => void;
}

interface ConnectionMetrics {
  totalConnections: number;
  activeDashboards: number;
  activeStreams: number;
  messagesPerSecond: number;
  averageLatency: number;
  peakConnections: number;
}

interface DashboardEvent {
  type: 'data_update' | 'widget_refresh' | 'filter_change' | 'layout_change' | 'alert' | 'error';
  dashboardId: string;
  widgetId?: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  userId?: string;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class RealtimeEngineService extends EventEmitter {
  private prisma: PrismaClient;
  private io: SocketIOServer | null = null;
  private redisPub: IORedis;
  private redisSub: IORedis;
  private connections: Map<string, DashboardConnection> = new Map();
  private streams: Map<string, StreamConfig> = new Map();
  private refreshSchedules: Map<string, RefreshSchedule> = new Map();
  private channelSubscriptions: Map<string, ChannelSubscription> = new Map();
  private dataCache: Map<string, { data: Record<string, unknown>[]; expiry: number }> = new Map();
  private messageCounter: number = 0;
  private latencySum: number = 0;
  private latencyCount: number = 0;
  private peakConnections: number = 0;
  private readonly CACHE_TTL = 5000;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.redisPub = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    });
    this.redisSub = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    });
  }

  async initialize(io: SocketIOServer): Promise<void> {
    this.io = io;

    io.on('connection', (socket: Socket) => {
      this.handleSocketConnection(socket);
    });

    this.redisSub.on('message', (channel: string, message: string) => {
      this.handleRedisMessage(channel, message);
    });

    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeat();
    }, this.HEARTBEAT_INTERVAL);

    const savedStreams = await this.prisma.dataStream.findMany({
      where: { enabled: true },
    });

    for (const stream of savedStreams) {
      const config: StreamConfig = {
        id: stream.id,
        dashboardId: stream.dashboardId,
        widgetId: stream.widgetId,
        dataSourceId: stream.dataSourceId,
        refreshInterval: stream.refreshInterval,
        query: stream.query,
        aggregation: stream.aggregation as unknown as AggregationConfig | undefined,
        filters: (stream.filters as unknown as FilterConfig[]) || [],
        maxDataPoints: stream.maxDataPoints || 1000,
        enabled: true,
      };
      this.streams.set(stream.id, config);
    }
  }

  private handleSocketConnection(socket: Socket): void {
    const userId = socket.handshake.auth?.userId || 'anonymous';
    const dashboardId = socket.handshake.query?.dashboardId as string;

    if (!dashboardId) {
      socket.emit('error', { message: 'Dashboard ID is required' });
      socket.disconnect();
      return;
    }

    const connection: DashboardConnection = {
      socketId: socket.id,
      userId,
      dashboardId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      subscriptions: [],
      metadata: {
        userAgent: socket.handshake.headers['user-agent'] || '',
        ip: socket.handshake.address,
      },
    };

    this.connections.set(socket.id, connection);
    socket.join(`dashboard:${dashboardId}`);

    if (this.connections.size > this.peakConnections) {
      this.peakConnections = this.connections.size;
    }

    this.logConnectionEvent('connect', connection);

    socket.on('subscribe_widget', (data: { widgetId: string; streamId: string }) => {
      this.handleWidgetSubscription(socket, connection, data);
    });

    socket.on('unsubscribe_widget', (data: { widgetId: string }) => {
      this.handleWidgetUnsubscription(socket, connection, data);
    });

    socket.on('request_refresh', (data: { widgetId?: string }) => {
      this.handleRefreshRequest(socket, connection, data);
    });

    socket.on('apply_filter', (data: { widgetId: string; filters: FilterConfig[] }) => {
      this.handleFilterApply(socket, connection, data);
    });

    socket.on('dashboard_event', (event: DashboardEvent) => {
      this.handleDashboardEvent(socket, connection, event);
    });

    socket.on('disconnect', () => {
      this.handleSocketDisconnection(socket, connection);
    });

    socket.on('ping', () => {
      connection.lastActivity = new Date();
      socket.emit('pong', { timestamp: Date.now() });
    });

    this.sendInitialData(socket, dashboardId);
  }

  private async sendInitialData(socket: Socket, dashboardId: string): Promise<void> {
    const dashboardStreams = Array.from(this.streams.values()).filter(
      s => s.dashboardId === dashboardId && s.enabled,
    );

    for (const stream of dashboardStreams) {
      try {
        const data = await this.fetchStreamData(stream);
        socket.emit('initial_data', {
          streamId: stream.id,
          widgetId: stream.widgetId,
          data: data.data,
          metadata: data.metadata,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        socket.emit('stream_error', {
          streamId: stream.id,
          widgetId: stream.widgetId,
          error: errMsg,
        });
      }
    }
  }

  private handleWidgetSubscription(
    socket: Socket,
    connection: DashboardConnection,
    data: { widgetId: string; streamId: string },
  ): void {
    const stream = this.streams.get(data.streamId);
    if (!stream) {
      socket.emit('error', { message: `Stream not found: ${data.streamId}` });
      return;
    }

    const channel = `stream:${data.streamId}`;
    socket.join(channel);

    if (!connection.subscriptions.includes(channel)) {
      connection.subscriptions.push(channel);
    }

    if (!this.channelSubscriptions.has(channel)) {
      const subscription: ChannelSubscription = {
        channel,
        dashboardId: connection.dashboardId,
        widgetIds: [data.widgetId],
        handler: (message: string) => {
          this.io?.to(channel).emit('data_update', JSON.parse(message));
        },
      };
      this.channelSubscriptions.set(channel, subscription);
      this.redisSub.subscribe(channel);
    } else {
      const sub = this.channelSubscriptions.get(channel)!;
      if (!sub.widgetIds.includes(data.widgetId)) {
        sub.widgetIds.push(data.widgetId);
      }
    }

    connection.lastActivity = new Date();
    this.ensureStreamRefresh(stream);
  }

  private handleWidgetUnsubscription(
    socket: Socket,
    connection: DashboardConnection,
    data: { widgetId: string },
  ): void {
    const channelPrefix = 'stream:';
    const toRemove: string[] = [];

    for (const [channel, sub] of this.channelSubscriptions) {
      const idx = sub.widgetIds.indexOf(data.widgetId);
      if (idx !== -1) {
        sub.widgetIds.splice(idx, 1);
        if (sub.widgetIds.length === 0) {
          toRemove.push(channel);
        }
      }
    }

    for (const channel of toRemove) {
      socket.leave(channel);
      this.channelSubscriptions.delete(channel);
      this.redisSub.unsubscribe(channel);
      connection.subscriptions = connection.subscriptions.filter(s => s !== channel);
    }

    connection.lastActivity = new Date();
  }

  private async handleRefreshRequest(
    socket: Socket,
    connection: DashboardConnection,
    data: { widgetId?: string },
  ): Promise<void> {
    const dashboardStreams = Array.from(this.streams.values()).filter(
      s => s.dashboardId === connection.dashboardId && s.enabled,
    );

    const targetStreams = data.widgetId
      ? dashboardStreams.filter(s => s.widgetId === data.widgetId)
      : dashboardStreams;

    for (const stream of targetStreams) {
      try {
        this.dataCache.delete(stream.id);
        const result = await this.fetchStreamData(stream);
        const update: DataUpdate = {
          streamId: stream.id,
          widgetId: stream.widgetId,
          dashboardId: stream.dashboardId,
          data: result.data,
          timestamp: new Date(),
          metadata: result.metadata,
        };

        socket.emit('data_update', update);
        this.publishUpdate(stream.id, update);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        socket.emit('stream_error', {
          streamId: stream.id,
          error: errMsg,
        });
      }
    }

    connection.lastActivity = new Date();
  }

  private async handleFilterApply(
    socket: Socket,
    connection: DashboardConnection,
    data: { widgetId: string; filters: FilterConfig[] },
  ): Promise<void> {
    const stream = Array.from(this.streams.values()).find(
      s => s.widgetId === data.widgetId && s.dashboardId === connection.dashboardId,
    );

    if (!stream) {
      socket.emit('error', { message: `Stream not found for widget: ${data.widgetId}` });
      return;
    }

    stream.filters = data.filters;
    this.streams.set(stream.id, stream);
    this.dataCache.delete(stream.id);

    try {
      const result = await this.fetchStreamData(stream);
      const update: DataUpdate = {
        streamId: stream.id,
        widgetId: stream.widgetId,
        dashboardId: stream.dashboardId,
        data: result.data,
        timestamp: new Date(),
        metadata: result.metadata,
      };

      this.io?.to(`dashboard:${connection.dashboardId}`).emit('data_update', update);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      socket.emit('stream_error', { streamId: stream.id, error: errMsg });
    }

    connection.lastActivity = new Date();
  }

  private handleDashboardEvent(
    socket: Socket,
    connection: DashboardConnection,
    event: DashboardEvent,
  ): void {
    event.timestamp = new Date();
    event.userId = connection.userId;

    socket.to(`dashboard:${connection.dashboardId}`).emit('dashboard_event', event);

    this.redisPub.publish(
      `dashboard:${connection.dashboardId}:events`,
      JSON.stringify(event),
    );

    this.emit('dashboard:event', event);
    connection.lastActivity = new Date();
  }

  private handleSocketDisconnection(socket: Socket, connection: DashboardConnection): void {
    for (const channel of connection.subscriptions) {
      socket.leave(channel);
    }

    this.connections.delete(socket.id);
    this.logConnectionEvent('disconnect', connection);

    const dashboardConnections = Array.from(this.connections.values()).filter(
      c => c.dashboardId === connection.dashboardId,
    );

    if (dashboardConnections.length === 0) {
      const dashboardStreams = Array.from(this.streams.values()).filter(
        s => s.dashboardId === connection.dashboardId,
      );
      for (const stream of dashboardStreams) {
        const schedule = this.refreshSchedules.get(stream.id);
        if (schedule && schedule.timerId) {
          clearInterval(schedule.timerId);
          schedule.enabled = false;
          this.refreshSchedules.set(stream.id, schedule);
        }
      }
    }
  }

  private async fetchStreamData(
    stream: StreamConfig,
  ): Promise<{ data: Record<string, unknown>[]; metadata: { rowCount: number; queryTime: number; cached: boolean } }> {
    const cached = this.dataCache.get(stream.id);
    if (cached && cached.expiry > Date.now()) {
      return {
        data: cached.data,
        metadata: { rowCount: cached.data.length, queryTime: 0, cached: true },
      };
    }

    const startTime = Date.now();
    const { conditions, params } = this.buildParameterizedFilters(stream.filters);

    let query = stream.query;
    if (conditions.length > 0) {
      const whereClause = conditions.join(' AND ');
      if (query.toLowerCase().includes('where')) {
        query += ` AND ${whereClause}`;
      } else {
        query += ` WHERE ${whereClause}`;
      }
    }

    if (stream.maxDataPoints > 0) {
      query += ` LIMIT ${Number(stream.maxDataPoints)}`;
    }

    const rawData: Record<string, unknown>[] = params.length > 0
      ? await this.prisma.$queryRawUnsafe(query, ...params) as Record<string, unknown>[]
      : await this.prisma.$queryRawUnsafe(query) as Record<string, unknown>[];
    let data = rawData;

    if (stream.aggregation) {
      data = this.applyAggregation(data, stream.aggregation);
    }

    const queryTime = Date.now() - startTime;

    this.dataCache.set(stream.id, {
      data,
      expiry: Date.now() + this.CACHE_TTL,
    });

    this.latencySum += queryTime;
    this.latencyCount++;

    return {
      data,
      metadata: { rowCount: data.length, queryTime, cached: false },
    };
  }

  private sanitizeFieldName(field: string): string {
    return field.replace(/[^a-zA-Z0-9_]/g, '');
  }

  private buildParameterizedFilters(filters: FilterConfig[]): { conditions: string[]; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const filter of filters) {
      const field = `"${this.sanitizeFieldName(filter.field)}"`;
      switch (filter.operator) {
        case 'eq':
          conditions.push(`${field} = $${paramIdx++}`);
          params.push(filter.value);
          break;
        case 'neq':
          conditions.push(`${field} != $${paramIdx++}`);
          params.push(filter.value);
          break;
        case 'gt':
          conditions.push(`${field} > $${paramIdx++}`);
          params.push(filter.value);
          break;
        case 'gte':
          conditions.push(`${field} >= $${paramIdx++}`);
          params.push(filter.value);
          break;
        case 'lt':
          conditions.push(`${field} < $${paramIdx++}`);
          params.push(filter.value);
          break;
        case 'lte':
          conditions.push(`${field} <= $${paramIdx++}`);
          params.push(filter.value);
          break;
        case 'in': {
          const vals = Array.isArray(filter.value) ? filter.value : [filter.value];
          const placeholders = vals.map(() => `$${paramIdx++}`).join(', ');
          conditions.push(`${field} IN (${placeholders})`);
          params.push(...vals);
          break;
        }
        case 'contains':
          conditions.push(`${field}::text ILIKE $${paramIdx++}`);
          params.push(`%${filter.value}%`);
          break;
        case 'between': {
          const range = filter.value as [unknown, unknown];
          conditions.push(`${field} BETWEEN $${paramIdx++} AND $${paramIdx++}`);
          params.push(range[0], range[1]);
          break;
        }
      }
    }

    return { conditions, params };
  }

  private applyAggregation(
    data: Record<string, unknown>[],
    config: AggregationConfig,
  ): Record<string, unknown>[] {
    if (!config.groupBy) {
      const aggregatedValue = this.computeAggregateValue(data, config.field, config.type);
      return [{ [config.field]: aggregatedValue, _aggregation: config.type }];
    }

    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of data) {
      const groupKey = String(row[config.groupBy] || 'null');
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(row);
    }

    const results: Record<string, unknown>[] = [];
    for (const [groupKey, groupRows] of groups) {
      const aggregatedValue = this.computeAggregateValue(groupRows, config.field, config.type);
      results.push({
        [config.groupBy]: groupKey,
        [config.field]: aggregatedValue,
        _count: groupRows.length,
        _aggregation: config.type,
      });
    }

    return results;
  }

  private computeAggregateValue(
    rows: Record<string, unknown>[],
    field: string,
    type: AggregationConfig['type'],
  ): number {
    const values = rows.map(r => Number(r[field]) || 0);
    if (values.length === 0) return 0;

    switch (type) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'count':
        return values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'first':
        return values[0];
      case 'last':
        return values[values.length - 1];
      default:
        return 0;
    }
  }

  private ensureStreamRefresh(stream: StreamConfig): void {
    if (this.refreshSchedules.has(stream.id)) {
      return;
    }

    const schedule: RefreshSchedule = {
      id: stream.id,
      dashboardId: stream.dashboardId,
      interval: stream.refreshInterval,
      lastRefresh: new Date(),
      nextRefresh: new Date(Date.now() + stream.refreshInterval),
      enabled: true,
    };

    schedule.timerId = setInterval(async () => {
      if (!schedule.enabled) return;

      try {
        this.dataCache.delete(stream.id);
        const result = await this.fetchStreamData(stream);
        const update: DataUpdate = {
          streamId: stream.id,
          widgetId: stream.widgetId,
          dashboardId: stream.dashboardId,
          data: result.data,
          timestamp: new Date(),
          metadata: result.metadata,
        };

        this.io?.to(`dashboard:${stream.dashboardId}`).emit('data_update', update);
        this.publishUpdate(stream.id, update);
        schedule.lastRefresh = new Date();
        schedule.nextRefresh = new Date(Date.now() + stream.refreshInterval);
        this.messageCounter++;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.io?.to(`dashboard:${stream.dashboardId}`).emit('stream_error', {
          streamId: stream.id,
          error: errMsg,
        });
      }
    }, stream.refreshInterval);

    this.refreshSchedules.set(stream.id, schedule);
  }

  private async publishUpdate(streamId: string, update: DataUpdate): Promise<void> {
    const channel = `stream:${streamId}`;
    await this.redisPub.publish(channel, JSON.stringify(update));
  }

  private handleRedisMessage(channel: string, message: string): void {
    const subscription = this.channelSubscriptions.get(channel);
    if (subscription) {
      subscription.handler(message);
    }

    if (channel.includes(':events')) {
      const dashboardId = channel.split(':')[1];
      this.io?.to(`dashboard:${dashboardId}`).emit('remote_event', JSON.parse(message));
    }
  }

  private performHeartbeat(): void {
    const now = Date.now();
    const staleThreshold = 60000;

    for (const [socketId, connection] of this.connections) {
      const timeSinceActivity = now - connection.lastActivity.getTime();
      if (timeSinceActivity > staleThreshold) {
        const socket = this.io?.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('heartbeat', { timestamp: now });
        }
      }
    }

    this.cleanExpiredCache();
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.dataCache) {
      if (cached.expiry < now) {
        this.dataCache.delete(key);
      }
    }
  }

  private async logConnectionEvent(
    event: 'connect' | 'disconnect',
    connection: DashboardConnection,
  ): Promise<void> {
    await this.prisma.connectionLog.create({
      data: {
        id: crypto.randomUUID(),
        event,
        socketId: connection.socketId,
        userId: connection.userId,
        dashboardId: connection.dashboardId,
        metadata: connection.metadata as unknown as Record<string, unknown>,
        timestamp: new Date(),
      },
    });
  }

  async registerStream(config: StreamConfig): Promise<void> {
    this.streams.set(config.id, config);

    await this.prisma.dataStream.upsert({
      where: { id: config.id },
      update: {
        dashboardId: config.dashboardId,
        widgetId: config.widgetId,
        dataSourceId: config.dataSourceId,
        refreshInterval: config.refreshInterval,
        query: config.query,
        aggregation: config.aggregation as unknown as Record<string, unknown>,
        filters: config.filters as unknown as Record<string, unknown>,
        maxDataPoints: config.maxDataPoints,
        enabled: config.enabled,
      },
      create: {
        id: config.id,
        dashboardId: config.dashboardId,
        widgetId: config.widgetId,
        dataSourceId: config.dataSourceId,
        refreshInterval: config.refreshInterval,
        query: config.query,
        aggregation: config.aggregation as unknown as Record<string, unknown>,
        filters: config.filters as unknown as Record<string, unknown>,
        maxDataPoints: config.maxDataPoints,
        enabled: config.enabled,
      },
    });
  }

  async removeStream(streamId: string): Promise<void> {
    const schedule = this.refreshSchedules.get(streamId);
    if (schedule && schedule.timerId) {
      clearInterval(schedule.timerId);
    }
    this.refreshSchedules.delete(streamId);
    this.streams.delete(streamId);
    this.dataCache.delete(streamId);

    await this.prisma.dataStream.update({
      where: { id: streamId },
      data: { enabled: false },
    });
  }

  getMetrics(): ConnectionMetrics {
    const avgLatency = this.latencyCount > 0 ? this.latencySum / this.latencyCount : 0;
    const activeDashboards = new Set(
      Array.from(this.connections.values()).map(c => c.dashboardId),
    ).size;

    return {
      totalConnections: this.connections.size,
      activeDashboards,
      activeStreams: this.refreshSchedules.size,
      messagesPerSecond: this.messageCounter,
      averageLatency: Math.round(avgLatency),
      peakConnections: this.peakConnections,
    };
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    for (const [, schedule] of this.refreshSchedules) {
      if (schedule.timerId) {
        clearInterval(schedule.timerId);
      }
    }

    for (const [, connection] of this.connections) {
      const socket = this.io?.sockets.sockets.get(connection.socketId);
      if (socket) {
        socket.emit('server_shutdown', { message: 'Server is shutting down' });
        socket.disconnect(true);
      }
    }

    await this.redisPub.quit();
    await this.redisSub.quit();
    this.connections.clear();
    this.streams.clear();
    this.refreshSchedules.clear();
    this.dataCache.clear();
  }
}
