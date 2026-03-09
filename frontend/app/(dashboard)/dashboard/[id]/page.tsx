"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  LayoutGrid,
  Settings,
  Share2,
  Maximize2,
} from "lucide-react";
import { getDashboardById } from "@/lib/api/dashboard";
import type { Widget } from "@/lib/api/dashboard";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

function WidgetChart({ widget }: { widget: Widget }) {
  const chartData = widget.data;

  if (widget.type === "kpi") {
    const value = chartData[0]?.[widget.config.yAxis || "value"] ?? 0;
    const label = widget.titleAr || widget.title;
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="text-4xl font-bold text-rasid-700 dark:text-rasid-400">
          {typeof value === "number" ? value.toLocaleString("ar-SA") : value}
        </p>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    );
  }

  if (widget.type === "table") {
    const columns = chartData.length > 0 ? Object.keys(chartData[0]) : [];
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1.5 text-start font-semibold text-gray-600 dark:text-gray-400"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chartData.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-2 py-1.5 text-gray-700 dark:text-gray-300"
                  >
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const xKey = widget.config.xAxis || (chartData[0] ? Object.keys(chartData[0])[0] : "x");
  const yKey = widget.config.yAxis || (chartData[0] ? Object.keys(chartData[0])[1] : "y");
  const colors = widget.config.colors || CHART_COLORS;

  if (widget.type === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey={yKey} fill={colors[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey={yKey}
            stroke={colors[0]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={colors[0]}
            fill={colors[0]}
            fillOpacity={0.2}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey={yKey}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius="75%"
            label={({ name, percent }) =>
              `${name}: ${(percent * 100).toFixed(0)}%`
            }
          >
            {chartData.map((_, index) => (
              <Cell key={index} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (widget.type === "scatter") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} name={xKey} />
          <YAxis dataKey={yKey} tick={{ fontSize: 11 }} name={yKey} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={chartData} fill={colors[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      نوع الرسم البياني غير مدعوم: {widget.type}
    </div>
  );
}

export default function DashboardViewPage() {
  const params = useParams();
  const router = useRouter();
  const dashboardId = params.id as string;

  const { data: dashboard, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", dashboardId],
    queryFn: () => getDashboardById(dashboardId),
    enabled: !!dashboardId,
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-rasid-600" />
          <p className="text-sm text-gray-500">جاري تحميل لوحة المعلومات...</p>
        </div>
      </div>
    );
  }

  if (isError || !dashboard) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          فشل تحميل لوحة المعلومات: {(error as Error)?.message || "غير موجودة"}
        </p>
        <button
          onClick={() => router.back()}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2"
        >
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          <span>العودة</span>
        </button>
      </div>
    );
  }

  const widgets = dashboard.widgets ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboard.nameAr || dashboard.name}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {dashboard.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">
            <Share2 className="h-4 w-4" />
          </button>
          <button className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">
            <Settings className="h-4 w-4" />
          </button>
          <button className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Empty widgets state */}
      {widgets.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 dark:border-gray-700">
          <LayoutGrid className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            لا توجد عناصر
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            لم يتم إضافة أي عناصر إلى هذه اللوحة بعد
          </p>
        </div>
      )}

      {/* Widgets grid */}
      {widgets.length > 0 && (
        <div className="grid auto-rows-[200px] grid-cols-12 gap-4">
          {widgets.map((widget) => {
            const colSpan = Math.min(widget.layout.w || 6, 12);
            const rowSpan = widget.layout.h || 1;
            return (
              <div
                key={widget.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
                style={{
                  gridColumn: `span ${colSpan}`,
                  gridRow: `span ${rowSpan}`,
                }}
              >
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {widget.titleAr || widget.title}
                  </h3>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    {widget.type}
                  </span>
                </div>
                <div className="h-[calc(100%-40px)] p-3">
                  <WidgetChart widget={widget} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
