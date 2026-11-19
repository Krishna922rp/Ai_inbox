const MAX_TITLE_LENGTH = 160;
const MAX_NOTE_LENGTH = 100_000;
const MAX_URL_LENGTH = 2_048;

export function validateIngestPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, error: 'Request body must be a JSON object.' };
  }

  const { type, title, content, url } = body;

  if (!['note', 'url'].includes(type)) {
    return { status: 400, error: 'type must be note or url.' };
  }

  if (title !== undefined && title !== null &&
    (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH)) {
    return { status: 400, error: 'Title must be 160 characters or fewer.' };
  }

  if (type === 'note') {
    if (typeof title !== 'string' || !title.trim() ||
      typeof content !== 'string' || !content.trim()) {
      return { status: 400, error: 'Notes require a title and content.' };
    }

    if (content.length > MAX_NOTE_LENGTH) {
      return { status: 413, error: 'Note content must be 100,000 characters or fewer.' };
    }

    return {
      value: { type, title: title.trim(), content: content.trim() }
    };
  }

  if (typeof url !== 'string' || !url.trim()) {
    return { status: 400, error: 'A URL is required.' };
  }

  if (url.length > MAX_URL_LENGTH) {
    return { status: 400, error: 'URL must be 2,048 characters or fewer.' };
  }

  return {
    value: {
      type,
      title: typeof title === 'string' ? title.trim() : undefined,
      url: url.trim()
    }
  };
}
