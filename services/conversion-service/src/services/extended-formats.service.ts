/**
 * Extended Format Conversion Service — Rasid Platform
 * دعم صيغ إضافية: Avro, GeoJSON, KML, ZIP/RAR
 */

import { PrismaClient } from '@prisma/client';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DataTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

interface ExtractedFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export class ExtendedFormatsService {
  constructor(private prisma: PrismaClient) {}

  // ─── Avro Format ──────────────────────────────────────────────────────────

  async convertToAvro(data: DataTable): Promise<Buffer> {
    const avro = await import('avsc');

    // Infer schema from data
    const fields = data.columns.map((col) => {
      const sampleVal = data.rows[0]?.[col];
      let avroType: string | string[] = 'string';

      if (typeof sampleVal === 'number') {
        avroType = Number.isInteger(sampleVal) ? 'long' : 'double';
      } else if (typeof sampleVal === 'boolean') {
        avroType = 'boolean';
      }

      return { name: col.replace(/[^a-zA-Z0-9_]/g, '_'), type: ['null', avroType] };
    });

    const schema = {
      type: 'record' as const,
      name: 'RasidRecord',
      fields,
    };

    const type = avro.Type.forSchema(schema);
    const buffers: Buffer[] = [];

    for (const row of data.rows) {
      const record: Record<string, unknown> = {};
      for (let i = 0; i < data.columns.length; i++) {
        const fieldName = fields[i].name;
        record[fieldName] = row[data.columns[i]] ?? null;
      }
      buffers.push(type.toBuffer(record));
    }

    // Create a simple container with the schema header
    const header = Buffer.from(JSON.stringify(schema), 'utf-8');
    const headerLength = Buffer.alloc(4);
    headerLength.writeUInt32BE(header.length, 0);

    return Buffer.concat([headerLength, header, ...buffers]);
  }

  async convertFromAvro(buffer: Buffer): Promise<DataTable> {
    const avro = await import('avsc');

    // Read header
    const headerLength = buffer.readUInt32BE(0);
    const schemaJson = buffer.subarray(4, 4 + headerLength).toString('utf-8');
    const schema = JSON.parse(schemaJson);
    const type = avro.Type.forSchema(schema);

    const rows: Record<string, unknown>[] = [];
    let offset = 4 + headerLength;

    while (offset < buffer.length) {
      try {
        const result = type.fromBuffer(buffer, undefined, true);
        rows.push(result as Record<string, unknown>);
        offset = buffer.length; // Simple approach - read all at once
      } catch {
        break;
      }
    }

    const columns = schema.fields?.map((f: Record<string, string>) => f.name) ?? [];
    return { columns, rows };
  }

  // ─── GeoJSON Export ───────────────────────────────────────────────────────

  convertToGeoJSON(
    data: DataTable,
    latCol: string,
    lngCol: string,
    propertyCols?: string[]
  ): Buffer {
    const features = data.rows
      .filter((row) => row[latCol] !== null && row[lngCol] !== null)
      .map((row) => {
        const lat = Number(row[latCol]);
        const lng = Number(row[lngCol]);

        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

        const properties: Record<string, unknown> = {};
        const cols = propertyCols ?? data.columns.filter((c) => c !== latCol && c !== lngCol);

        for (const col of cols) {
          properties[col] = row[col];
        }

        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [lng, lat],
          },
          properties,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const geoJSON = {
      type: 'FeatureCollection' as const,
      features,
    };

    return Buffer.from(JSON.stringify(geoJSON, null, 2), 'utf-8');
  }

  // ─── KML Format ───────────────────────────────────────────────────────────

  convertToKML(
    data: DataTable,
    latCol: string,
    lngCol: string,
    nameCol?: string,
    descCol?: string
  ): Buffer {
    const placemarks = data.rows
      .filter((row) => row[latCol] !== null && row[lngCol] !== null)
      .map((row) => {
        const lat = Number(row[latCol]);
        const lng = Number(row[lngCol]);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return '';

        const name = nameCol ? this.escapeXml(String(row[nameCol] ?? '')) : '';
        const description = descCol ? this.escapeXml(String(row[descCol] ?? '')) : '';

        return `    <Placemark>
      <name>${name}</name>
      <description>${description}</description>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
      })
      .filter((p) => p.length > 0)
      .join('\n');

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Rasid Export</name>
${placemarks}
  </Document>
</kml>`;

    return Buffer.from(kml, 'utf-8');
  }

  convertFromKML(buffer: Buffer): DataTable {
    const kmlStr = buffer.toString('utf-8');
    const rows: Record<string, unknown>[] = [];

    // Simple KML parser using regex
    const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    const nameRegex = /<name>([\s\S]*?)<\/name>/;
    const descRegex = /<description>([\s\S]*?)<\/description>/;
    const coordRegex = /<coordinates>([\s\S]*?)<\/coordinates>/;

    let match: RegExpExecArray | null;
    while ((match = placemarkRegex.exec(kmlStr)) !== null) {
      const placemark = match[1];

      const nameMatch = placemark.match(nameRegex);
      const descMatch = placemark.match(descRegex);
      const coordMatch = placemark.match(coordRegex);

      if (coordMatch) {
        const coords = coordMatch[1].trim().split(',');
        rows.push({
          name: nameMatch?.[1]?.trim() ?? '',
          description: descMatch?.[1]?.trim() ?? '',
          longitude: parseFloat(coords[0]) || 0,
          latitude: parseFloat(coords[1]) || 0,
          altitude: parseFloat(coords[2]) || 0,
        });
      }
    }

    return {
      columns: ['name', 'description', 'longitude', 'latitude', 'altitude'],
      rows,
    };
  }

  // ─── ZIP/RAR Extraction ───────────────────────────────────────────────────

  async extractZip(zipBuffer: Buffer): Promise<ExtractedFile[]> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const supportedExtensions = new Set([
      'csv', 'xlsx', 'xls', 'json', 'pdf', 'docx', 'doc', 'pptx', 'txt', 'xml',
    ]);

    const files: ExtractedFile[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const ext = entry.entryName.split('.').pop()?.toLowerCase() ?? '';
      if (!supportedExtensions.has(ext)) continue;

      const buffer = entry.getData();
      files.push({
        filename: entry.entryName,
        mimeType: this.extensionToMime(ext),
        buffer,
      });
    }

    return files;
  }

  async extractRar(rarBuffer: Buffer): Promise<ExtractedFile[]> {
    // Use 7z command-line tool for RAR extraction
    const tempId = randomBytes(8).toString('hex');
    const inputPath = join(process.env.TEMP ?? '/tmp', `rar_input_${tempId}.rar`);
    const outputDir = join(process.env.TEMP ?? '/tmp', `rar_output_${tempId}`);

    try {
      await mkdir(outputDir, { recursive: true });
      await writeFile(inputPath, rarBuffer);

      await execAsync(`7z x "${inputPath}" -o"${outputDir}" -y`, { timeout: 120000 });

      const files: ExtractedFile[] = [];
      const { readdir, stat } = await import('fs/promises');

      const processDir = async (dir: string): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await processDir(fullPath);
          } else {
            const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
            const supportedExtensions = new Set([
              'csv', 'xlsx', 'xls', 'json', 'pdf', 'docx', 'pptx', 'txt',
            ]);
            if (supportedExtensions.has(ext)) {
              const buf = await readFile(fullPath);
              files.push({
                filename: entry.name,
                mimeType: this.extensionToMime(ext),
                buffer: buf,
              });
            }
          }
        }
      };

      await processDir(outputDir);
      return files;
    } finally {
      const { rm } = await import('fs/promises');
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});
      await unlink(inputPath).catch(() => {});
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private extensionToMime(ext: string): string {
    const map: Record<string, string> = {
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      json: 'application/json',
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      xml: 'application/xml',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
