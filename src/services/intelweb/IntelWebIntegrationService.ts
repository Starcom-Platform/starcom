// IntelWebIntegrationService
// Bridges Intel/IntelReportData → VirtualFileSystem/DataPack + GraphData for IntelWeb

import { IntelReportData } from '../../models/IntelReportData';
import { DataPack, VirtualFileSystem, DataPackRelationship, VirtualFile, VirtualDirectory } from '../../types/DataPack';
import { IntelNode, IntelEdge } from '../../applications/intelweb/components/Graph/IntelGraph';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { normalizeEntityName } from '../intel/entity/normalizeEntityName';
import { frontmatterTime, nodeTimeFields } from '../intel/recordTime';
import type { IntelHub, IntelStructure, IntelTarget } from './intelStructure';
import { intelVariantOf } from '../../components/Globe/intelVariant';
import { reportCategoryOf } from '../intel/reportCategory';

/**
 * Maps a real, canonical IntelReportUI (services/intel — the substrate every
 * other app writes to) onto the legacy IntelReportData shape buildFromReports
 * expects. IntelWeb previously only ever saw two hardcoded demo reports; this
 * is what lets it render whatever's actually been published elsewhere in the
 * app instead. `entities` now carries IntelReportUI.entityRefs through —
 * author-tagged, never inferred, but real: this is the first point where a
 * real report's named entities actually reach buildFromReports's entity
 * registry, which previously only ever fired for ad-hoc, hand-constructed
 * test/demo objects.
 */
export function intelReportUIToReportData(report: IntelReportUI): IntelReportData {
  // As the globe reads a report (D-IW, IW12; reportMarker.ts): its own tags, its author's and its
  // category together, and its stated priority.
  const markerTags = [...new Set([...(report.tags ?? []), ...(report.hashtags ?? []), ...(report.category ? [report.category] : [])])];
  const intelCategory = reportCategoryOf(markerTags);
  return {
    assessment: intelVariantOf({ tags: markerTags, priority: report.priority }),
    ...(intelCategory ? { intelCategory } : {}),
    id: report.id,
    title: report.title,
    content: report.content,
    tags: report.tags,
    latitude: report.latitude,
    longitude: report.longitude,
    // What IntelWeb groups it by (D-IW, IW8): the jurisdictions and tags its author stated.
    ...(report.jurisdictions?.length ? { jurisdictions: report.jurisdictions } : {}),
    ...(report.hashtags?.length ? { hashtags: report.hashtags } : {}),
    // It names a person, as its source names them (D-NP, NP1): IntelWeb labels it as the reports' views do.
    ...(report.namesPeople ? { namesPeople: true } : {}),
    ...(report.sourceLinks?.length ? { sourceLinks: report.sourceLinks } : {}),
    // When it was written, as the rest of the app reads a report's record time.
    timestamp: (report.updatedAt ?? report.createdAt).getTime(),
    // When the event happened, and how closely it is known (decision D-E).
    ...(report.startDate ? { startDate: report.startDate.toISOString() } : {}),
    ...(report.endDate ? { endDate: report.endDate.toISOString() } : {}),
    ...(report.timePrecisionMs !== undefined ? { timePrecisionMs: report.timePrecisionMs } : {}),
    author: report.author,
    visibility: report.visibility,
    // 0..1, matching IntelReportUI and reportMappers (the STORAGE mapper, which
    // writes and reads confidence unscaled). This used to be
    // Math.round(confidence * 100), which was the only 0..100 producer of this
    // field anywhere and made the lowest confidences round-trip to the highest:
    // 0.01 became 1, then normalizeConfidence's `v > 1` test failed, so 1 was
    // read back as 1.0 — maximum. It then passed the [0.3, 1.0] graph filter it
    // should have failed, and drew as one of the largest nodes on the canvas.
    confidence: report.confidence ?? undefined,
    summary: report.summary,
    categories: report.category ? [report.category] : undefined,
    reliability: report.reliability,
    entities: report.entityRefs
  };
}

/**
 * The names the vault gives what links the notes (D-IW, step 1). English by default, as a service's
 * words are (D-ML); IntelWeb's words join the catalogue with its screen.
 */
export interface StructureWords {
  country: (code: string) => string;
  tag: (tag: string) => string;
  publisher: (key: string) => string;
  /** A mission package held here, by its title; one not held, by its `d` tag. */
  mission: (target: IntelTarget, d: string) => string;
  /** Something named that is not held here: a note, or linked intel. */
  stub: (target: IntelTarget, d: string) => string;
}

const regionName = (code: string): string => {
  if (!/^[a-z]{2}$/i.test(code)) return code.toUpperCase();
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase(); } catch { return code.toUpperCase(); }
};

export const STRUCTURE_WORDS: StructureWords = {
  country: regionName,
  tag: (tag) => `#${tag}`,
  publisher: (key) => `Publisher ${key.slice(0, 8)}`,
  mission: (target, d) => (target.held && target.title ? target.title : `Mission package ${d}, not held here`),
  stub: (target, d) => (target.kind === 'intel' ? `Intel not held here: ${d}` : `A note not held here: ${d}`),
};

/** The folder each kind of hub is kept in. */
const HUB_DIR: Record<IntelHub['kind'], string> = { country: 'countries/', tag: 'tags/', publisher: 'publishers/' };
/** What a note's link to a hub says. */
const HUB_PREDICATE: Record<IntelHub['kind'], string> = { country: 'in_country', tag: 'tagged', publisher: 'published_by' };
/** An address's `d` tag, or an id's first characters: enough to tell two stubs apart. */
const shortName = (id: string): string => (/^\d+:[0-9a-f]{64}:/.test(id) ? id.split(':').slice(2).join(':') : id.length > 16 ? `${id.slice(0, 12)}…` : id);

export interface BuildResult {
  vfs: VirtualFileSystem;
  graph: { nodes: IntelNode[]; edges: IntelEdge[] };
  dataPack?: DataPack;
  warnings?: string[];
  /**
   * Report id -> the vault path that report became.
   *
   * Deep-linking needs this and had no way to get it: the vault path is a
   * slug of the title plus a short hash, and the report id is never written
   * into frontmatter — deliberately, since frontmatter flows into node.metadata
   * and out to the MetadataPanel as user-visible noise. So the mapping existed
   * only inside the loop that built it and was discarded on return.
   *
   * An index keeps it out of the rendered content while still letting a caller
   * say "open THIS report" rather than "open the file whose slug I guessed".
   */
  reportPathById: Map<string, string>;
}

// Helper utilities
// Removed classification constants/utilities for OSINT

function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function shortId(id?: string): string {
  if (!id) return Math.random().toString(36).slice(2, 8);
  return id.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || Math.random().toString(36).slice(2, 8);
}

/**
 * Clamp a confidence to 0..1.
 *
 * The `> 1` branch is a last resort for FOREIGN frontmatter — a vault someone
 * hand-wrote or imported with a percentage. It is a guess, and it cannot be
 * anything better: a bare `1` is indistinguishable from full confidence on a
 * 0..1 scale and from one percent on a 0..100 one. That ambiguity is precisely
 * how the round-trip bug above survived.
 *
 * So nothing in this codebase may feed it a 0..100 value. Both producers of
 * IntelReportData.confidence — reportMappers and intelReportUIToReportData —
 * are on 0..1, and the type's scale should stay that way.
 */
function normalizeConfidence(value?: number): number {
  if (value == null || isNaN(value)) return 0.6;
  const v = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, v));
}

function iso(ts: number | string | Date | undefined): string | undefined {
  if (ts == null) return undefined;
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  } catch {
    return undefined;
  }
}

function deterministicFileId(path: string, fm: any): string {
  // Use path segments + primary identifier fields to ensure stability
  // e.g., reports/{slug}.md already stable; here we can just return path.
  return path; // Placeholder (path already deterministic after slugify + shortId stable input)
}

export class IntelWebIntegrationService {
  // Convert reports to a VFS and GraphData (minimal viable implementation)
  async buildFromReports(
    reports: IntelReportData[],
    options: { structure?: IntelStructure; words?: Partial<StructureWords> } = {},
  ): Promise<BuildResult> {
    const warnings: string[] = [];

    // Initialize VFS skeleton
    const nowISO = new Date().toISOString();
    const root: VirtualDirectory = { path: '', name: 'root', children: ['reports/', 'entities/'], files: [], createdAt: nowISO, modifiedAt: nowISO };
    const dirReports: VirtualDirectory = { path: 'reports/', name: 'reports', children: [], files: [], createdAt: nowISO, modifiedAt: nowISO };
    const dirEntities: VirtualDirectory = { path: 'entities/', name: 'entities', children: [], files: [], createdAt: nowISO, modifiedAt: nowISO };

    const fileIndex = new Map<string, VirtualFile>();
    const directoryIndex = new Map<string, VirtualDirectory>([
      [root.path, root],
      [dirReports.path, dirReports],
      [dirEntities.path, dirEntities],
      // No location nodes (D-IW, IW11): a note keeps its own point, in its frontmatter.
    ]);

    const relationshipGraph: DataPackRelationship[] = [];
    // Built alongside the files rather than derived afterwards: the slug is
    // computed here and nowhere else, so recomputing it later would be a second
    // implementation of the same rule, free to drift.
    const reportPathById = new Map<string, string>();

    // Registries to resolve wikilinks
    const entityPathByName = new Map<string, string>();

    // First pass: create report and entity files
    for (const report of reports) {
      const title = report.title || 'Untitled Report';
      const rSlug = `${slugify(title)}-${shortId(report.id)}`;
      const reportPath = `reports/${rSlug}.md`;
      if (report.id) reportPathById.set(report.id, reportPath);
      const confidence = normalizeConfidence(report.confidence);
      const coords =
        typeof report.latitude === 'number' && typeof report.longitude === 'number'
          ? [report.latitude, report.longitude]
          : undefined;

      const entityNames: string[] = [];
      // entities is typed string[] (see IntelReportData.entities), but the
      // loose per-item handling stays — some callers still construct this
      // object by hand with richer {name}/{title} entries rather than the
      // canonical IntelReportUI.entityRefs -> entities mapping.
      const entities = report.entities as unknown[] | undefined;
      if (Array.isArray(entities)) {
        for (const e of entities) {
          const name = typeof e === 'string' ? e : (e as { name?: string; title?: string })?.name ?? (e as { name?: string; title?: string })?.title;
          if (name && !entityNames.includes(name)) entityNames.push(String(name));
        }
      }

      // Ensure entity files exist
      for (const name of entityNames) {
        const entityKey = normalizeEntityName(name);
        if (!entityPathByName.has(entityKey)) {
          const ePath = `entities/${slugify(name)}-${shortId(name)}.md`;
          const eFile: VirtualFile = {
            path: ePath,
            name: ePath.split('/').pop() || `${slugify(name)}.md`,
            extension: 'md',
            size: 0,
            mimeType: 'text/markdown',
            encoding: 'utf-8',
            hash: '',
            createdAt: nowISO,
            modifiedAt: nowISO,
            content: `---\nconfidence: 0.75\ntype: entity\ntags: [entity]\n---\n\n# ${name}\n\n`,
            frontmatter: {
              confidence: 0.75,
              type: 'entity',
              tags: ['entity']
            },
            relationships: []
          };
          fileIndex.set(ePath, eFile);
          dirEntities.files.push(ePath);
          entityPathByName.set(entityKey, ePath);
        }
      }


      // Build report content with wikilinks
      const wikilinksBlock = entityNames.length ? '## Entities\n- ' + entityNames.map(n => `[[${n}]]`).join('\n- ') : undefined;

      // Aggregate tags from tags + categories
      const tagSet = new Set<string>();
      if (Array.isArray(report.tags)) report.tags.forEach(t => tagSet.add(t));
      if (Array.isArray(report.categories)) report.categories.forEach(c => tagSet.add(c));
      const tags = Array.from(tagSet);

      const reportFrontmatter = {
        confidence,
        type: 'report',
        coordinates: coords,
        tags,
        ...(report.jurisdictions?.length ? { jurisdictions: report.jurisdictions } : {}),
        ...(report.hashtags?.length ? { hashtags: report.hashtags } : {}),
        ...(report.namesPeople ? { namesPeople: true } : {}),
        ...(report.sourceLinks?.length ? { sourceLinks: report.sourceLinks } : {}),
        ...(report.assessment ? { assessment: report.assessment } : {}),
        ...(report.intelCategory ? { intelCategory: report.intelCategory } : {}),
        entities: entityNames,
        sources: Array.isArray(report.sources) ? report.sources : [],
        timestamp: iso(report.timestamp),
        author: report.author,
        // The event time, when the report states one: nodes are placed by it (decision D-E).
        ...(iso(report.startDate) ? { startDate: iso(report.startDate) } : {}),
        ...(iso(report.endDate) ? { endDate: iso(report.endDate) } : {}),
        ...(typeof report.timePrecisionMs === 'number' ? { timePrecisionMs: report.timePrecisionMs } : {})
      } as Record<string, unknown>;

      const reportBody = [
        `---`,
        `confidence: ${confidence}`,
        `type: report`,
        coords ? `coordinates: [${coords[0]}, ${coords[1]}]` : undefined,
        `tags: [${tags.join(', ')}]`,
        entityNames.length ? `entities: [${entityNames.join(', ')}]` : undefined,
        reportFrontmatter.timestamp ? `timestamp: ${reportFrontmatter.timestamp}` : undefined,
        reportFrontmatter.author ? `author: ${reportFrontmatter.author}` : undefined,
        reportFrontmatter.startDate ? `startDate: ${reportFrontmatter.startDate}` : undefined,
        reportFrontmatter.endDate ? `endDate: ${reportFrontmatter.endDate}` : undefined,
        reportFrontmatter.timePrecisionMs ? `timePrecisionMs: ${reportFrontmatter.timePrecisionMs}` : undefined,
        `---`,
        '',
        `# ${title}`,
        '',
        report.summary ? '## Executive Summary\n' + report.summary : undefined,
        wikilinksBlock,
        report.content ? '## Content\n' + report.content : undefined
      ].filter(Boolean).join('\n');

      const rFile: VirtualFile = {
        path: reportPath,
        name: `${rSlug}.md`,
        extension: 'md',
        size: reportBody.length,
        mimeType: 'text/markdown',
        encoding: 'utf-8',
        hash: '',
        createdAt: nowISO,
        modifiedAt: nowISO,
        content: reportBody,
        frontmatter: reportFrontmatter,
        relationships: []
      };

      fileIndex.set(reportPath, rFile);
      dirReports.files.push(reportPath);

      // Relationships: report → entities (predicate: mentions)
      for (const name of entityNames) {
        const ePath = entityPathByName.get(normalizeEntityName(name));
        if (ePath) {
          relationshipGraph.push({
            source: reportPath,
            target: ePath,
            type: 'wikilink',
            strength: 0.6,
            metadata: {
              predicate: 'mentions',
              provenance: {
                source: 'IntelWebIntegrationService',
                reportId: report.id || rSlug,
                reportPath,
                author: report.author,
                timestamp: reportFrontmatter.timestamp || iso(report.timestamp) || nowISO
              }
            }
          });
        }
      }

    }

    if (options.structure) {
      this.addStructure(options.structure, { ...STRUCTURE_WORDS, ...options.words }, {
        root, fileIndex, directoryIndex, relationshipGraph, reportPathById, nowISO,
      });
    }

    const vfs: VirtualFileSystem = {
      root,
      fileIndex,
      directoryIndex,
      relationshipGraph
    };

    // Build GraphData directly from VFS (simple pass)
    const { nodes, edges } = this.toGraphData(vfs);

    return { vfs, graph: { nodes, edges }, warnings, reportPathById };
  }

  /**
   * What links the notes (D-IW, step 1): a file for each hub, mission package and stub, and a
   * relationship from each note to what it shares or names. Each path is keyed by what it stands for,
   * so two notes stating the same country meet at one file.
   */
  private addStructure(
    structure: IntelStructure,
    words: StructureWords,
    vault: {
      root: VirtualDirectory;
      fileIndex: Map<string, VirtualFile>;
      directoryIndex: Map<string, VirtualDirectory>;
      relationshipGraph: DataPackRelationship[];
      reportPathById: Map<string, string>;
      nowISO: string;
    },
  ): void {
    const { root, fileIndex, directoryIndex, relationshipGraph, reportPathById, nowISO } = vault;
    const folder = (path: string): VirtualDirectory => {
      let dir = directoryIndex.get(path);
      if (!dir) {
        dir = { path, name: path.replace(/\/$/, ''), children: [], files: [], createdAt: nowISO, modifiedAt: nowISO };
        directoryIndex.set(path, dir);
        root.children.push(path);
      }
      return dir;
    };
    const addFile = (path: string, name: string, frontmatter: Record<string, unknown>) => {
      if (fileIndex.has(path)) return;
      const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
      fileIndex.set(path, {
        path, name, extension: 'md', size: 0, mimeType: 'text/markdown', encoding: 'utf-8', hash: '',
        createdAt: nowISO, modifiedAt: nowISO,
        content: `---\n${lines}\n---\n\n# ${name}\n`,
        frontmatter,
        relationships: [],
      } as VirtualFile);
      folder(path.slice(0, path.indexOf('/') + 1)).files.push(path);
    };
    const relate = (source: string, target: string, predicate: string, strength: number, reportId: string) => {
      relationshipGraph.push({
        source, target, type: 'related', strength,
        metadata: { predicate, provenance: { source: 'IntelWebIntegrationService', reportId } },
      });
    };

    for (const hub of structure.hubs) {
      const path = `${HUB_DIR[hub.kind]}${encodeURIComponent(hub.key)}.md`;
      const name = hub.kind === 'country' ? words.country(hub.key) : hub.kind === 'tag' ? words.tag(hub.key) : words.publisher(hub.key);
      // Stated by the notes themselves, so as certain as anything here.
      addFile(path, name, { type: hub.kind, confidence: 1, key: hub.key, notes: hub.members.length });
      for (const member of hub.members) {
        const source = reportPathById.get(member);
        if (source) relate(source, path, HUB_PREDICATE[hub.kind], 0.4, member);
      }
    }

    const targetPath = new Map<string, string>();
    for (const target of structure.targets) {
      const mission = target.kind === 'mission';
      const path = `${mission ? 'missions/' : 'stubs/'}${encodeURIComponent(target.id)}.md`;
      const d = shortName(target.id);
      targetPath.set(target.id, path);
      // Named but not held: the note says it exists, nothing here shows what it says.
      addFile(path, mission ? words.mission(target, d) : words.stub(target, d), {
        type: mission ? 'mission' : 'stub', confidence: target.held ? 1 : 0.5, held: target.held, address: target.id, of: target.kind,
      });
    }

    for (const link of structure.links) {
      const source = reportPathById.get(link.from);
      const target = reportPathById.get(link.to) ?? targetPath.get(link.to);
      if (!source || !target) continue;
      const predicate = target.startsWith('missions/') ? 'names_mission' : link.why === 'linked-intel' ? 'linked_intel' : link.why;
      relate(source, target, predicate, 0.8, link.from);
    }
  }

  // Convert VFS to GraphData compatible with IntelGraph
  private toGraphData(vfs: VirtualFileSystem): { nodes: IntelNode[]; edges: IntelEdge[] } {
    const nodes: IntelNode[] = [];
    const edges: IntelEdge[] = [];

    const nodeById = new Map<string, IntelNode>();

    for (const file of vfs.fileIndex.values()) {
      const fm = (file.frontmatter || {}) as any;
      const type = (fm.type as IntelNode['type']) || 'report';
      const confidence = normalizeConfidence(typeof fm.confidence === 'number' ? fm.confidence : undefined);

      const node: IntelNode = {
        id: deterministicFileId(file.path, fm),
        type,
        confidence,
        title: file.name,
        description: fm.description || '',
        // Placed by the event its frontmatter states, or when its record was written;
        // every file this service builds carries the moment the vault was built.
        ...nodeTimeFields(frontmatterTime(fm, file.modifiedAt)),
        location: Array.isArray(fm.coordinates) ? fm.coordinates : undefined,
        tags: Array.isArray(file.hashtags) ? file.hashtags : [],
        metadata: fm,
        color: undefined,
        size: undefined,
        group: type,
        file
      };
      nodes.push(node);
      nodeById.set(node.id, node);
    }

    // Prefer explicit relationshipGraph edges
    for (const rel of vfs.relationshipGraph || []) {
      const sourceId = rel.source;
      const targetId = rel.target;
      if (!nodeById.has(sourceId) || !nodeById.has(targetId)) continue;

      const predicate = (rel.metadata && (rel.metadata as any).predicate) as string | undefined;
      let edgeType: IntelEdge['type'] = 'reference';
      if (predicate === 'located_at' || predicate === 'observed_at') edgeType = 'spatial';
      else if (predicate === 'temporal' || predicate === 'occurred_at') edgeType = 'temporal';
      else edgeType = 'reference';

      const id = `${sourceId}-${targetId}-${predicate || rel.type}`;
      edges.push({
        id,
        source: sourceId,
        target: targetId,
        type: edgeType,
        weight: typeof rel.strength === 'number' ? rel.strength : 0.5,
        confidence: Math.min(nodeById.get(sourceId)!.confidence, nodeById.get(targetId)!.confidence),
        metadata: rel.metadata || {}
      });
    }

    return { nodes, edges };
  }
}
