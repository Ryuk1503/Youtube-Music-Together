const { artistKey } = require('./artistPreference');
const collapsed = /\s+(?:và\s+\d+\s+người\s+khác|and\s+\d+\s+others?)\s*$/iu;
const clean = name => name.replace(collapsed, '').trim().replace(/(?:\s*[-–—|]?\s*(?:offic(?:ial|al)(?:\s+(?:channel|music))?|topic|vevo))+\s*$/i, '').trim();
const words = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const unique = names => Array.from(new Map(names.map(clean).filter(name => artistKey({ author: name })).map(name => [artistKey({ author: name }), { key: artistKey({ author: name }), name }])).values());
const contains = (title, name) => ` ${words(title)} `.includes(` ${words(name)} `);

function summaryArtists(song) {
  if (!song) return [];
  const author = typeof song.author === 'string' ? song.author : '';
  const title = typeof song.title === 'string' ? song.title : '';
  const channels = Array.isArray(song.channelNames) ? song.channelNames.filter(n => typeof n === 'string') : [];
  const base = clean(author);
  const names = unique(channels.length ? channels : [base]).map(a => a.name);
  // Preserve complete band names when supported by the title.
  const candidates = names.flatMap(name => contains(title, name) ? [name] : name.split(/\s+(?:và|and|x)\s+|\s*[&,]\s*/iu).map(clean));
  const matched = candidates.filter(name => name && contains(title, name));
  const strip = value => value.replace(/\s*[([](?:official|lyrics?|audio|music video|mv|visualizer|live|video)\b.*$/iu, '').trim();
  const featuring = /\s+\b(?:ft\.?|feat\.?|featuring)\s+/iu;
  const segments = title.split(/\s+[-–—|]\s+/u).map(strip);
  const segment = segments.find(s => featuring.test(s));
  let credits = [];
  if (segment) {
    const parts = segment.split(featuring);
    const main = parts.shift();
    if (segments.length > 1 || matched.some(name => contains(main, name))) credits.push(main);
    credits.push(...parts);
    credits = credits.flatMap(part => part.split(/\s*,\s*|\s+[x×]\s+/iu)).map(strip);
  }
  const result = unique([...matched, ...credits]);
  if (result.length) return result;
  // One actual channel is not a collapsed list: its ampersand may be part
  // of a band name, including audio uploads whose title is only the song.
  if (channels.length === 1 && !collapsed.test(channels[0])) return unique(channels);
  // Never store a collapsed or unresolved multi-channel label as an artist.
  const fallback = channels.length === 1 ? clean(channels[0]) : base;
  if (!collapsed.test(author) && channels.length <= 1 && !/\s+(?:và|and|x)\s+|[&,]/iu.test(fallback)) return unique([fallback]);
  return [];
}
module.exports = { summaryArtists };
