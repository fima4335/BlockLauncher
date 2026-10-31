export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  project_type: string;
  downloads: number;
  icon_url?: string;
  versions: string[];
  game_versions: string[];
  loaders?: string[];
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  changelog?: string;
  dependencies: ModrinthDependency[];
  game_versions: string[];
  loaders: string[];
  files: {
    url: string;
    filename: string;
    primary: boolean;
    hashes: { sha1: string; sha512: string };
  }[];
  version_type: 'release' | 'beta' | 'alpha';
}

export interface ModrinthDependency {
  version_id: string | null;
  project_id: string | null;
  file_name: string | null;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface DependencyReport {
  mod: {
    id: string;
    slug: string;
    title: string;
    icon_url?: string;
  };
  required: AnalyzedMod[];
  optional: AnalyzedMod[];
  incompatible: AnalyzedMod[];
  embedded: AnalyzedMod[];
  addons: AnalyzedMod[]; // популярные моды, которые зависят от этого или хорошо работают вместе
  loaders: string[];
  game_versions: string[];
}

export interface AnalyzedMod {
  id: string;
  slug: string;
  title: string;
  description?: string;
  icon_url?: string;
  downloads?: number;
  dependency_type?: string;
  reason?: string;
}
