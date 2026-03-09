import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// ─── Interfaces ──────────────────────────────────────────────────────
interface EmbeddingRequest {
  texts: string[];
  model: string;
  dimensions?: number;
  normalize?: boolean;
}

interface EmbeddingResult {
  id: string;
  embeddings: number[][];
  model: string;
  dimensions: number;
  tokenCount: number;
  latencyMs: number;
}

interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  namespace: string;
  createdAt: Date;
}

interface SimilaritySearchOptions {
  query: string;
  namespace: string;
  topK: number;
  minScore: number;
  filters?: Record<string, unknown>;
  includeContent: boolean;
  includeMetadata: boolean;
}

interface SimilarityResult {
  documentId: string;
  score: number;
  content?: string;
  metadata?: Record<string, unknown>;
  rank: number;
}

interface ClusterConfig {
  k: number;
  maxIterations: number;
  convergenceThreshold: number;
  initMethod: 'random' | 'kmeans++';
  distanceMetric: 'cosine' | 'euclidean' | 'manhattan';
}

interface ClusterResult {
  id: string;
  clusters: Cluster[];
  totalDocuments: number;
  iterations: number;
  converged: boolean;
  inertia: number;
  silhouetteScore: number;
}

interface Cluster {
  id: number;
  centroid: number[];
  documentIds: string[];
  size: number;
  density: number;
  topTerms: string[];
}

interface IndexStatistics {
  namespace: string;
  totalDocuments: number;
  dimensions: number;
  averageVectorNorm: number;
  memoryUsageMB: number;
}

// ─── Service ─────────────────────────────────────────────────────────
export default class EmbeddingEngineService {
  private prisma: PrismaClient;
  private vectorStore: Map<string, Map<string, VectorDocument>> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();
  private readonly CACHE_SIZE_LIMIT = 10000;
  private readonly DEFAULT_DIMENSIONS = 1536;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const dimensions = request.dimensions || this.DEFAULT_DIMENSIONS;
    const embeddings: number[][] = [];
    let totalTokens = 0;

    for (const text of request.texts) {
      const cacheKey = crypto.createHash('md5').update(`${request.model}:${text}`).digest('hex');
      const cached = this.embeddingCache.get(cacheKey);

      if (cached) {
        embeddings.push(cached);
        totalTokens += Math.ceil(text.length / 4);
        continue;
      }

      let embedding: number[];

      if (request.model.startsWith('text-embedding')) {
        embedding = await this.callOpenAIEmbedding(text, request.model, dimensions);
      } else {
        embedding = this.generateLocalEmbedding(text, dimensions);
      }

      if (request.normalize !== false) {
        embedding = this.normalizeVector(embedding);
      }

      this.cacheEmbedding(cacheKey, embedding);
      embeddings.push(embedding);
      totalTokens += Math.ceil(text.length / 4);
    }

    const result: EmbeddingResult = {
      id: crypto.randomUUID(),
      embeddings,
      model: request.model,
      dimensions,
      tokenCount: totalTokens,
      latencyMs: Date.now() - startTime,
    };

    return result;
  }

  private async callOpenAIEmbedding(
    text: string,
    model: string,
    dimensions: number,
  ): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return this.generateLocalEmbedding(text, dimensions);
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model,
        dimensions,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  private generateLocalEmbedding(text: string, dimensions: number): number[] {
    const embedding = new Array(dimensions);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/g, '');
    const words = normalized.split(/\s+/).filter(w => w.length > 0);

    const seed = this.hashString(normalized);
    let state = seed;

    for (let i = 0; i < dimensions; i++) {
      state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
      embedding[i] = ((state >>> 0) / 0xFFFFFFFF) * 2 - 1;
    }

    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      const wordHash = this.hashString(word);
      const dimOffset = wordHash % dimensions;

      for (let i = 0; i < Math.min(10, dimensions); i++) {
        const idx = (dimOffset + i) % dimensions;
        const charSum = word.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
        embedding[idx] += (charSum / 1000) * (w < words.length / 2 ? 1 : 0.5);
      }

      if (word.length > 3) {
        const bigramIdx = (wordHash * 31) % dimensions;
        embedding[bigramIdx] += 0.1;
      }
    }

    embedding[0] += words.length * 0.01;
    embedding[1] += text.length * 0.001;

    const hasArabic = /[\u0600-\u06FF]/.test(text);
    if (hasArabic) {
      embedding[2] += 0.5;
    }

    return embedding;
  }

  private hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
    }
    return hash >>> 0;
  }

  private normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;
    return vector.map(v => v / norm);
  }

  private cacheEmbedding(key: string, embedding: number[]): void {
    if (this.embeddingCache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(key, embedding);
  }

  async indexDocument(
    content: string,
    namespace: string,
    metadata: Record<string, unknown> = {},
    documentId?: string,
  ): Promise<VectorDocument> {
    const id = documentId || crypto.randomUUID();

    const embeddingResult = await this.generateEmbeddings({
      texts: [content],
      model: 'text-embedding-3-small',
      normalize: true,
    });

    const doc: VectorDocument = {
      id,
      content,
      embedding: embeddingResult.embeddings[0],
      metadata,
      namespace,
      createdAt: new Date(),
    };

    if (!this.vectorStore.has(namespace)) {
      this.vectorStore.set(namespace, new Map());
    }
    this.vectorStore.get(namespace)!.set(id, doc);

    await this.prisma.vectorDocument.upsert({
      where: { id },
      update: {
        content: doc.content,
        embedding: doc.embedding,
        metadata: doc.metadata as unknown as Record<string, unknown>,
        namespace: doc.namespace,
        updatedAt: new Date(),
      },
      create: {
        id: doc.id,
        content: doc.content,
        embedding: doc.embedding,
        metadata: doc.metadata as unknown as Record<string, unknown>,
        namespace: doc.namespace,
        createdAt: doc.createdAt,
        updatedAt: doc.createdAt,
      },
    });

    return doc;
  }

  async indexDocumentsBatch(
    documents: { content: string; metadata?: Record<string, unknown>; id?: string }[],
    namespace: string,
    batchSize: number = 50,
  ): Promise<{ indexed: number; failed: number; errors: string[] }> {
    let indexed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const texts = batch.map(d => d.content);

      try {
        const embeddingResult = await this.generateEmbeddings({
          texts,
          model: 'text-embedding-3-small',
          normalize: true,
        });

        for (let j = 0; j < batch.length; j++) {
          const doc = batch[j];
          const id = doc.id || crypto.randomUUID();

          const vectorDoc: VectorDocument = {
            id,
            content: doc.content,
            embedding: embeddingResult.embeddings[j],
            metadata: doc.metadata || {},
            namespace,
            createdAt: new Date(),
          };

          if (!this.vectorStore.has(namespace)) {
            this.vectorStore.set(namespace, new Map());
          }
          this.vectorStore.get(namespace)!.set(id, vectorDoc);

          await this.prisma.vectorDocument.upsert({
            where: { id },
            update: {
              content: vectorDoc.content,
              embedding: vectorDoc.embedding,
              metadata: vectorDoc.metadata as unknown as Record<string, unknown>,
              namespace,
              updatedAt: new Date(),
            },
            create: {
              id: vectorDoc.id,
              content: vectorDoc.content,
              embedding: vectorDoc.embedding,
              metadata: vectorDoc.metadata as unknown as Record<string, unknown>,
              namespace,
              createdAt: vectorDoc.createdAt,
              updatedAt: vectorDoc.createdAt,
            },
          });

          indexed++;
        }
      } catch (error) {
        failed += batch.length;
        errors.push(`Batch ${i / batchSize}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { indexed, failed, errors };
  }

  async searchSimilar(options: SimilaritySearchOptions): Promise<SimilarityResult[]> {
    const queryEmbedding = await this.generateEmbeddings({
      texts: [options.query],
      model: 'text-embedding-3-small',
      normalize: true,
    });

    const queryVector = queryEmbedding.embeddings[0];

    let documents: VectorDocument[] = [];
    const nsStore = this.vectorStore.get(options.namespace);

    if (nsStore && nsStore.size > 0) {
      documents = Array.from(nsStore.values());
    } else {
      const dbDocs = await this.prisma.vectorDocument.findMany({
        where: { namespace: options.namespace },
      });

      documents = dbDocs.map(d => ({
        id: d.id,
        content: d.content,
        embedding: d.embedding as number[],
        metadata: (d.metadata as Record<string, unknown>) || {},
        namespace: d.namespace,
        createdAt: d.createdAt,
      }));

      if (!this.vectorStore.has(options.namespace)) {
        this.vectorStore.set(options.namespace, new Map());
      }
      for (const doc of documents) {
        this.vectorStore.get(options.namespace)!.set(doc.id, doc);
      }
    }

    if (options.filters) {
      documents = documents.filter(doc => {
        for (const [key, value] of Object.entries(options.filters!)) {
          if (doc.metadata[key] !== value) return false;
        }
        return true;
      });
    }

    const scored = documents.map(doc => ({
      documentId: doc.id,
      score: this.cosineSimilarity(queryVector, doc.embedding),
      content: options.includeContent ? doc.content : undefined,
      metadata: options.includeMetadata ? doc.metadata : undefined,
    }));

    scored.sort((a, b) => b.score - a.score);

    const filtered = scored.filter(s => s.score >= options.minScore);
    const topK = filtered.slice(0, options.topK);

    return topK.map((result, index) => ({
      ...result,
      score: Math.round(result.score * 10000) / 10000,
      rank: index + 1,
    }));
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  async clusterDocuments(
    namespace: string,
    config: ClusterConfig,
  ): Promise<ClusterResult> {
    const nsStore = this.vectorStore.get(namespace);
    if (!nsStore || nsStore.size === 0) {
      throw new Error(`No documents found in namespace: ${namespace}`);
    }

    const documents = Array.from(nsStore.values());
    const vectors = documents.map(d => d.embedding);
    const k = Math.min(config.k, documents.length);

    let centroids: number[][] = this.initializeCentroids(vectors, k, config.initMethod);
    let assignments = new Array(vectors.length).fill(0);
    let converged = false;
    let iterations = 0;

    for (let iter = 0; iter < config.maxIterations; iter++) {
      iterations = iter + 1;

      const newAssignments = vectors.map(vec => {
        let bestCluster = 0;
        let bestDistance = Infinity;

        for (let c = 0; c < k; c++) {
          const dist = this.computeDistance(vec, centroids[c], config.distanceMetric);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestCluster = c;
          }
        }

        return bestCluster;
      });

      const hasChanged = newAssignments.some((a, i) => a !== assignments[i]);
      assignments = newAssignments;

      const newCentroids: number[][] = [];
      for (let c = 0; c < k; c++) {
        const clusterVectors = vectors.filter((_, i) => assignments[i] === c);
        if (clusterVectors.length === 0) {
          newCentroids.push(centroids[c]);
          continue;
        }

        const dims = clusterVectors[0].length;
        const centroid = new Array(dims).fill(0);
        for (const vec of clusterVectors) {
          for (let d = 0; d < dims; d++) {
            centroid[d] += vec[d];
          }
        }
        for (let d = 0; d < dims; d++) {
          centroid[d] /= clusterVectors.length;
        }
        newCentroids.push(centroid);
      }

      let maxShift = 0;
      for (let c = 0; c < k; c++) {
        const shift = this.computeDistance(centroids[c], newCentroids[c], 'euclidean');
        maxShift = Math.max(maxShift, shift);
      }

      centroids = newCentroids;

      if (!hasChanged || maxShift < config.convergenceThreshold) {
        converged = true;
        break;
      }
    }

    const clusters: Cluster[] = [];
    for (let c = 0; c < k; c++) {
      const clusterDocIds = documents
        .filter((_, i) => assignments[i] === c)
        .map(d => d.id);

      const clusterDocs = documents.filter((_, i) => assignments[i] === c);
      const density = this.computeClusterDensity(
        clusterDocs.map(d => d.embedding),
        centroids[c],
        config.distanceMetric,
      );

      const topTerms = this.extractClusterTerms(clusterDocs, 10);

      clusters.push({
        id: c,
        centroid: centroids[c],
        documentIds: clusterDocIds,
        size: clusterDocIds.length,
        density: Math.round(density * 10000) / 10000,
        topTerms,
      });
    }

    const inertia = this.computeInertia(vectors, assignments, centroids, config.distanceMetric);
    const silhouetteScore = this.computeSilhouetteScore(vectors, assignments, config.distanceMetric);

    const result: ClusterResult = {
      id: crypto.randomUUID(),
      clusters,
      totalDocuments: documents.length,
      iterations,
      converged,
      inertia: Math.round(inertia * 100) / 100,
      silhouetteScore: Math.round(silhouetteScore * 10000) / 10000,
    };

    await this.prisma.clusterResult.create({
      data: {
        id: result.id,
        namespace,
        config: config as unknown as Record<string, unknown>,
        clusterCount: k,
        totalDocuments: result.totalDocuments,
        iterations: result.iterations,
        converged: result.converged,
        inertia: result.inertia,
        silhouetteScore: result.silhouetteScore,
        createdAt: new Date(),
      },
    });

    return result;
  }

  private initializeCentroids(
    vectors: number[][],
    k: number,
    method: string,
  ): number[][] {
    if (method === 'kmeans++') {
      return this.kMeansPlusPlusInit(vectors, k);
    }

    const indices = new Set<number>();
    while (indices.size < k) {
      indices.add(crypto.randomInt(vectors.length));
    }
    return Array.from(indices).map(i => [...vectors[i]]);
  }

  private kMeansPlusPlusInit(vectors: number[][], k: number): number[][] {
    const centroids: number[][] = [];
    const firstIdx = crypto.randomInt(vectors.length);
    centroids.push([...vectors[firstIdx]]);

    for (let c = 1; c < k; c++) {
      const distances = vectors.map(vec => {
        let minDist = Infinity;
        for (const centroid of centroids) {
          const dist = this.computeDistance(vec, centroid, 'euclidean');
          minDist = Math.min(minDist, dist);
        }
        return minDist * minDist;
      });

      const totalDist = distances.reduce((a, b) => a + b, 0);
      let random = (crypto.randomInt(1000000) / 1000000) * totalDist;
      let selectedIdx = 0;

      for (let i = 0; i < distances.length; i++) {
        random -= distances[i];
        if (random <= 0) {
          selectedIdx = i;
          break;
        }
      }

      centroids.push([...vectors[selectedIdx]]);
    }

    return centroids;
  }

  private computeDistance(a: number[], b: number[], metric: string): number {
    switch (metric) {
      case 'cosine':
        return 1 - this.cosineSimilarity(a, b);
      case 'manhattan':
        return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
      case 'euclidean':
      default:
        return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
    }
  }

  private computeClusterDensity(
    vectors: number[][],
    centroid: number[],
    metric: string,
  ): number {
    if (vectors.length === 0) return 0;
    const avgDist = vectors.reduce((sum, vec) =>
      sum + this.computeDistance(vec, centroid, metric), 0,
    ) / vectors.length;

    return 1 / (1 + avgDist);
  }

  private extractClusterTerms(documents: VectorDocument[], topN: number): string[] {
    const wordCounts = new Map<string, number>();

    for (const doc of documents) {
      const words = doc.content.toLowerCase().split(/\s+/);
      const uniqueWords = new Set(words);
      for (const word of uniqueWords) {
        if (word.length >= 3) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word]) => word);
  }

  private computeInertia(
    vectors: number[][],
    assignments: number[],
    centroids: number[][],
    metric: string,
  ): number {
    let inertia = 0;
    for (let i = 0; i < vectors.length; i++) {
      const dist = this.computeDistance(vectors[i], centroids[assignments[i]], metric);
      inertia += dist * dist;
    }
    return inertia;
  }

  private computeSilhouetteScore(
    vectors: number[][],
    assignments: number[],
    metric: string,
  ): number {
    if (vectors.length < 2) return 0;

    const sampleSize = Math.min(vectors.length, 500);
    const sampleIndices = new Set<number>();
    while (sampleIndices.size < sampleSize) {
      sampleIndices.add(crypto.randomInt(vectors.length));
    }

    let totalScore = 0;
    let count = 0;

    for (const i of sampleIndices) {
      const cluster = assignments[i];
      const sameCluster = vectors.filter((_, j) => assignments[j] === cluster && j !== i);
      const a = sameCluster.length > 0
        ? sameCluster.reduce((sum, v) => sum + this.computeDistance(vectors[i], v, metric), 0) / sameCluster.length
        : 0;

      let minB = Infinity;
      const otherClusters = new Set(assignments.filter(c => c !== cluster));
      for (const otherCluster of otherClusters) {
        const otherVectors = vectors.filter((_, j) => assignments[j] === otherCluster);
        if (otherVectors.length === 0) continue;
        const b = otherVectors.reduce((sum, v) =>
          sum + this.computeDistance(vectors[i], v, metric), 0,
        ) / otherVectors.length;
        minB = Math.min(minB, b);
      }

      if (minB === Infinity) minB = 0;
      const s = Math.max(a, minB) === 0 ? 0 : (minB - a) / Math.max(a, minB);
      totalScore += s;
      count++;
    }

    return count > 0 ? totalScore / count : 0;
  }

  async deleteNamespace(namespace: string): Promise<number> {
    const nsStore = this.vectorStore.get(namespace);
    const count = nsStore ? nsStore.size : 0;
    this.vectorStore.delete(namespace);

    await this.prisma.vectorDocument.deleteMany({
      where: { namespace },
    });

    return count;
  }

  async getStatistics(namespace: string): Promise<IndexStatistics> {
    const nsStore = this.vectorStore.get(namespace);
    const docs = nsStore ? Array.from(nsStore.values()) : [];

    const totalNorm = docs.reduce((sum, doc) => {
      const norm = Math.sqrt(doc.embedding.reduce((s, v) => s + v * v, 0));
      return sum + norm;
    }, 0);

    const avgNorm = docs.length > 0 ? totalNorm / docs.length : 0;
    const dimensions = docs.length > 0 ? docs[0].embedding.length : this.DEFAULT_DIMENSIONS;
    const memoryBytes = docs.reduce((sum, doc) =>
      sum + doc.content.length * 2 + doc.embedding.length * 8, 0,
    );

    return {
      namespace,
      totalDocuments: docs.length,
      dimensions,
      averageVectorNorm: Math.round(avgNorm * 10000) / 10000,
      memoryUsageMB: Math.round(memoryBytes / 1048576 * 100) / 100,
    };
  }
}
