import { libraryApi } from "./client";

export type LibraryAssetType =
  | "image"
  | "video"
  | "document"
  | "audio"
  | "font"
  | "icon"
  | "other";

export interface LibraryAsset {
  id: string;
  name: string;
  type: LibraryAssetType;
  mimeType: string;
  size: number;
  downloadUrl: string;
  thumbnailUrl: string;
  folderId: string | null;
  tags: string[];
  description: string | null;
  extension: string;
  checksum: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  path: string | null;
  assetCount: number;
  children: LibraryFolder[];
  createdAt: string;
  updatedAt: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface AssetListItemResponse {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[];
  mimeType?: string | null;
  extension?: string | null;
  fileSize?: number | null;
  folderId?: string | null;
  thumbnailKey?: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface AssetDetailsResponse {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[];
  mimeType?: string | null;
  extension?: string | null;
  fileSize?: number | null;
  folderId?: string | null;
  checksum?: string | null;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  userId?: string | null;
}

interface UploadAssetResponse {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[];
  mimeType?: string | null;
  extension?: string | null;
  fileSize?: number | null;
  checksum?: string | null;
  hasThumbnail?: boolean;
  createdAt: string;
}

function unwrapEnvelope<T>(response: { data: ApiEnvelope<T> }): ApiEnvelope<T> {
  return response.data;
}

function normalizeStorageUrl(rawUrl?: string | null): string {
  if (!rawUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.hostname === "minio") {
      return "";
    }
    return parsedUrl.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeAssetName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return name;
  }

  if (!/[ØÙÃÐÑ]/.test(trimmed)) {
    return trimmed;
  }

  try {
    const binary = Uint8Array.from(trimmed, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(binary).trim();
    return decoded || trimmed;
  } catch {
    return trimmed;
  }
}

function inferAssetType(mimeType?: string | null): LibraryAssetType {
  if (!mimeType) {
    return "other";
  }

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.includes("font")) {
    return "font";
  }

  if (mimeType.includes("svg")) {
    return "icon";
  }

  if (
    mimeType.includes("pdf") ||
    mimeType.includes("sheet") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("document") ||
    mimeType.includes("presentation") ||
    mimeType.includes("text") ||
    mimeType.includes("json")
  ) {
    return "document";
  }

  return "other";
}

function normalizeAsset(
  asset: AssetListItemResponse | AssetDetailsResponse | UploadAssetResponse
): LibraryAsset {
  const mimeType = asset.mimeType ?? "application/octet-stream";
  const detailsAsset = asset as AssetDetailsResponse;

  return {
    id: asset.id,
    name: normalizeAssetName(asset.name),
    type: inferAssetType(mimeType),
    mimeType,
    size: asset.fileSize ?? 0,
    downloadUrl: normalizeStorageUrl(detailsAsset.downloadUrl),
    thumbnailUrl: normalizeStorageUrl(detailsAsset.thumbnailUrl),
    folderId: "folderId" in asset ? asset.folderId ?? null : null,
    tags: Array.isArray(asset.tags) ? asset.tags : [],
    description: asset.description ?? null,
    extension: asset.extension ?? "",
    checksum: "checksum" in asset ? asset.checksum ?? null : null,
    createdAt: asset.createdAt,
    updatedAt: "updatedAt" in asset && asset.updatedAt ? asset.updatedAt : asset.createdAt,
    createdBy: "userId" in asset ? asset.userId ?? null : null,
  };
}

function normalizeFolder(folder: LibraryFolder): LibraryFolder {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    path: folder.path,
    assetCount: folder.assetCount ?? 0,
    children: Array.isArray(folder.children) ? folder.children.map(normalizeFolder) : [],
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

export interface UploadAssetPayload {
  file: File;
  description?: string;
  tags?: string[];
}

export async function fetchAssets(params?: {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  folderId?: string;
}): Promise<{ data: LibraryAsset[]; total: number }> {
  const response = await libraryApi.get<ApiEnvelope<AssetListItemResponse[]>>("/assets", {
    params,
  });
  const envelope = unwrapEnvelope(response);
  const items = Array.isArray(envelope.data) ? envelope.data.map(normalizeAsset) : [];
  return {
    data: items,
    total: envelope.pagination?.totalCount ?? items.length,
  };
}

export async function fetchAsset(id: string): Promise<LibraryAsset> {
  const response = await libraryApi.get<ApiEnvelope<AssetDetailsResponse>>(`/assets/${id}`);
  return normalizeAsset(unwrapEnvelope(response).data);
}

export async function downloadAssetBlob(id: string): Promise<Blob> {
  const response = await libraryApi.get<Blob>(`/assets/${id}/download`, {
    responseType: "blob",
  });
  return response.data;
}

export async function uploadAsset(payload: UploadAssetPayload): Promise<LibraryAsset> {
  const formData = new FormData();
  formData.append("file", payload.file);
  if (payload.description) {
    formData.append("description", payload.description);
  }
  if (payload.tags && payload.tags.length > 0) {
    formData.append("tags", payload.tags.join(","));
  }

  const response = await libraryApi.post<ApiEnvelope<UploadAssetResponse>>("/assets", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return normalizeAsset(unwrapEnvelope(response).data);
}

export async function deleteAsset(id: string): Promise<void> {
  await libraryApi.delete(`/assets/${id}`);
}

export async function fetchFolders(): Promise<LibraryFolder[]> {
  const response = await libraryApi.get<ApiEnvelope<LibraryFolder[]>>("/folders/tree");
  const envelope = unwrapEnvelope(response);
  return Array.isArray(envelope.data) ? envelope.data.map(normalizeFolder) : [];
}

export async function createFolder(payload: {
  name: string;
  parentId?: string;
}): Promise<LibraryFolder> {
  const response = await libraryApi.post<ApiEnvelope<LibraryFolder>>("/folders", payload);
  return normalizeFolder(unwrapEnvelope(response).data);
}

export async function deleteFolder(id: string): Promise<void> {
  await libraryApi.delete(`/folders/${id}`);
}

export async function moveAsset(
  id: string,
  folderId: string
): Promise<{ id: string; newFolderId: string }> {
  const response = await libraryApi.put<ApiEnvelope<{ id: string; newFolderId: string }>>(
    `/assets/${id}/move`,
    { folderId }
  );
  return unwrapEnvelope(response).data;
}

export async function moveFolder(
  id: string,
  newParentId: string | null
): Promise<{ id: string; newParentId: string | null }> {
  const response = await libraryApi.put<ApiEnvelope<{ id: string; newParentId: string | null }>>(
    `/folders/${id}/move`,
    { newParentId }
  );
  return unwrapEnvelope(response).data;
}

export async function updateAsset(
  id: string,
  payload: Partial<Pick<LibraryAsset, "folderId">>
): Promise<{ id: string; newFolderId: string }> {
  if (!payload.folderId) {
    throw new Error("folderId is required to move an asset");
  }

  return moveAsset(id, payload.folderId);
}

export async function renameFolder(
  id: string,
  name: string
): Promise<{ id: string; newParentId: string | null }> {
  void id;
  void name;
  throw new Error("Folder rename is not exposed because library-service does not provide a rename endpoint.");
}
