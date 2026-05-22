export type SocialShareTarget = 'x' | 'facebook' | 'linkedin' | 'whatsapp';

export interface SocialShareInput {
  url: string;
  text: string;
  title?: string;
}

export const SOCIAL_SHARE_TARGETS: Array<{
  id: SocialShareTarget;
  label: string;
}> = [
  { id: 'x', label: 'X / Twitter' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

export function buildArtifactSocialShareTitle(fileName: string): string {
  const baseName = fileName.split('/').pop()?.replace(/\.html?$/i, '').trim();
  return baseName || 'Open Design artifact';
}

export function buildArtifactSocialShareText(input: { title: string }): string {
  return `Built with Open Design: ${input.title}`;
}

export function buildArtifactSocialShareCaption(input: {
  title: string;
  url?: string;
}): string {
  const lines = [
    buildArtifactSocialShareText({ title: input.title }),
    input.url?.trim() || '',
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildSocialShareUrl(target: SocialShareTarget, input: SocialShareInput): string {
  const text = input.text.trim();
  const url = input.url.trim();
  const title = input.title?.trim() || text;

  if (target === 'x') {
    const params = new URLSearchParams({ text, url });
    return `https://x.com/intent/tweet?${params.toString()}`;
  }

  if (target === 'facebook') {
    const params = new URLSearchParams({ u: url });
    return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
  }

  if (target === 'linkedin') {
    const params = new URLSearchParams({
      shareActive: 'true',
      text,
      shareUrl: url,
    });
    return `https://www.linkedin.com/feed/?${params.toString()}`;
  }

  const params = new URLSearchParams({
    text: `${title} ${url}`.trim(),
  });
  return `https://wa.me/?${params.toString()}`;
}

export function isLikelyPublicShareUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return false;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map((part) => Number(part));
    if (parts.some((part) => part < 0 || part > 255)) return false;
    const [first = 0, second = 0] = parts;
    if (first === 10) return false;
    if (first === 127) return false;
    if (first === 169 && second === 254) return false;
    if (first === 172 && second >= 16 && second <= 31) return false;
    if (first === 192 && second === 168) return false;
  }

  return true;
}
