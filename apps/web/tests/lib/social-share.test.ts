import { describe, expect, it } from 'vitest';
import {
  buildArtifactSocialShareCaption,
  buildArtifactSocialShareText,
  buildArtifactSocialShareTitle,
  buildSocialShareUrl,
  isLikelyPublicShareUrl,
} from '../../src/lib/social-share';

describe('social-share helpers', () => {
  it('derives friendly artifact titles and captions from html filenames', () => {
    const title = buildArtifactSocialShareTitle('exports/campaign-page.html');

    expect(title).toBe('campaign-page');
    expect(buildArtifactSocialShareText({ title })).toBe('Built with Open Design: campaign-page');
    expect(buildArtifactSocialShareCaption({
      title,
      url: 'https://demo.example/page',
    })).toBe('Built with Open Design: campaign-page\nhttps://demo.example/page');
  });

  it('builds platform share URLs for public artifact links', () => {
    const input = {
      text: 'Built with Open Design: Launch page',
      title: 'Launch page',
      url: 'https://demo.example/launch',
    };

    const x = new URL(buildSocialShareUrl('x', input));
    expect(x.origin).toBe('https://x.com');
    expect(x.pathname).toBe('/intent/tweet');
    expect(x.searchParams.get('text')).toBe(input.text);
    expect(x.searchParams.get('url')).toBe(input.url);

    const facebook = new URL(buildSocialShareUrl('facebook', input));
    expect(facebook.origin).toBe('https://www.facebook.com');
    expect(facebook.pathname).toBe('/sharer/sharer.php');
    expect(facebook.searchParams.get('u')).toBe(input.url);

    const linkedin = new URL(buildSocialShareUrl('linkedin', input));
    expect(linkedin.origin).toBe('https://www.linkedin.com');
    expect(linkedin.searchParams.get('shareActive')).toBe('true');
    expect(linkedin.searchParams.get('shareUrl')).toBe(input.url);

    const whatsapp = new URL(buildSocialShareUrl('whatsapp', input));
    expect(whatsapp.origin).toBe('https://wa.me');
    expect(whatsapp.searchParams.get('text')).toBe(`${input.title} ${input.url}`);
  });

  it('rejects local and private URLs for social share intents', () => {
    expect(isLikelyPublicShareUrl('/api/projects/1/raw/index.html')).toBe(false);
    expect(isLikelyPublicShareUrl('http://127.0.0.1:3000/index.html')).toBe(false);
    expect(isLikelyPublicShareUrl('https://localhost/index.html')).toBe(false);
    expect(isLikelyPublicShareUrl('https://192.168.1.8/index.html')).toBe(false);
    expect(isLikelyPublicShareUrl('https://172.20.0.2/index.html')).toBe(false);
    expect(isLikelyPublicShareUrl('https://example.com/index.html')).toBe(true);
  });
});
