export const RLSH_GROUP_KEY_TAG_PREFIX = 'RLSH_GROUP_KEY:';

export const getRLSHGroupKeyFromTags = (tags: string[] | null | undefined): string | null => {
  if (!Array.isArray(tags) || tags.length === 0) {
    return null;
  }

  const matched = tags.find((tag) => typeof tag === 'string' && tag.startsWith(RLSH_GROUP_KEY_TAG_PREFIX));
  if (!matched) {
    return null;
  }

  const groupKey = matched.slice(RLSH_GROUP_KEY_TAG_PREFIX.length).trim();
  return groupKey || null;
};

export const getRLSHLocationKey = (latitude?: number, longitude?: number): string | null => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return `${latitude.toFixed(5)}|${longitude.toFixed(5)}`;
};
