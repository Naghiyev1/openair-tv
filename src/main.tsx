import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Hls from 'hls.js';
import { Globe2, Search, Star, Tv, Upload, Waves, X } from 'lucide-react';
import './styles.css';

type Country = {
  code: string;
  name: string;
  flag?: string;
};

type M3UEntry = {
  id: string;
  name: string;
  logo: string;
  group: string;
  url: string;
  userAgent?: string;
  referrer?: string;
};

type Mode =
  | { kind: 'country'; code: string }
  | { kind: 'category'; slug: 'sports' | 'xxx'; label: string }
  | { kind: 'custom'; url: string };

const API = 'https://iptv-org.github.io/api';
const PLAYLIST_BASE = 'https://iptv-org.github.io/iptv';
const CUSTOM_URL_KEY = 'openair.customPlaylistUrl';
const FAVORITES_KEY = 'openair.favorites';
const RECENTS_KEY = 'openair.recents';
const DEFAULT_COUNTRY = 'us';

function getStoredString(key: string, fallback = '') {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function getStoredArray(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredArray(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can fail in private browsing modes. The app should still work.
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function fetchPlaylist(url: string): Promise<M3UEntry[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Playlist not found');
  const text = await res.text();
  return parseM3U(text);
}

function parseM3U(text: string): M3UEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: M3UEntry[] = [];
  let meta: Partial<M3UEntry> | null = null;
  let extras: Record<string, string> = {};
  let counter = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const attrs: Record<string, string> = {};
      const re = /([a-zA-Z0-9-]+)="([^"]*)"/g;
      let match: RegExpExecArray | null;

      while ((match = re.exec(line))) attrs[match[1]] = match[2];

      const name = line.split(',').slice(1).join(',').trim() || attrs['tvg-name'] || 'Unknown channel';
      meta = {
        name,
        logo: attrs['tvg-logo'] || '',
        group: attrs['group-title'] || '',
        userAgent: attrs['http-user-agent'],
      };
      extras = {};
    } else if (line.startsWith('#EXTVLCOPT:')) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        const key = line.substring('#EXTVLCOPT:'.length, eq);
        const val = line.substring(eq + 1);
        extras[key] = val;
      }
    } else if (line.startsWith('#')) {
      continue;
    } else if (meta) {
      const stablePart = `${meta.name}-${line}`.toLowerCase();
      const id = `${stablePart.replace(/[^a-z0-9]+/g, '-').slice(0, 80)}-${counter++}`;
      entries.push({
        id,
        name: meta.name || 'Unknown channel',
        logo: meta.logo || '',
        group: meta.group || '',
        url: line,
        userAgent: meta.userAgent || extras['http-user-agent'],
        referrer: extras['http-referrer'],
      });
      meta = null;
      extras = {};
    }
  }

  return entries;
}

function isValidPlaylistUrl(input: string): boolean {
  if (!input || input.length > 2048) return false;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function playlistUrlForMode(mode: Mode): string {
  if (mode.kind === 'country') return `${PLAYLIST_BASE}/countries/${mode.code.toLowerCase()}.m3u`;
  if (mode.kind === 'category') return `${PLAYLIST_BASE}/categories/${mode.slug}.m3u`;
  return mode.url;
}

function modeLabel(mode: Mode, countries: Country[]) {
  if (mode.kind === 'category') return mode.label;
  if (mode.kind === 'custom') return 'Custom playlist';
  const match = countries.find((country) => country.code.toLowerCase() === mode.code.toLowerCase());
  return match ? `${match.flag ? `${match.flag} ` : ''}${match.name}` : mode.code.toUpperCase();
}

function App() {
  const [mode, setMode] = useState<Mode>({ kind: 'country', code: DEFAULT_COUNTRY });
  const [countries, setCountries] = useState<Country[]>([]);
  const [countriesError, setCountriesError] = useState('');
  const [entries, setEntries] = useState<M3UEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState('');
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState<M3UEntry | null>(null);
  const [showAdult, setShowAdult] = useState(false);
  const [customUrl, setCustomUrl] = useState(() => getStoredString(CUSTOM_URL_KEY));
  const [customDraft, setCustomDraft] = useState(() => getStoredString(CUSTOM_URL_KEY));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => getStoredArray(FAVORITES_KEY));
  const [recentIds, setRecentIds] = useState<string[]>(() => getStoredArray(RECENTS_KEY));
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const playlistUrl = useMemo(() => playlistUrlForMode(mode), [mode]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<Country[]>('countries.json')
      .then((data) => {
        if (!cancelled) setCountries(data);
      })
      .catch(() => {
        if (!cancelled) setCountriesError('Country list could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!playlistUrl) {
      setEntries([]);
      setPlaylistError('Add a custom playlist URL to load channels.');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setPlaylistError('');

    fetchPlaylist(playlistUrl)
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setPlaylistError("Couldn't load this playlist.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playlistUrl]);

  const playable = useMemo(() => entries.filter((entry) => !entry.userAgent && !entry.referrer), [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return playable
      .filter((entry) => !q || entry.name.toLowerCase().includes(q) || entry.group.toLowerCase().includes(q))
      .filter((entry) => !showOnlyFavorites || favoriteIds.includes(entry.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [playable, search, showOnlyFavorites, favoriteIds]);

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  const recentChannels = useMemo(
    () => recentIds.map((id) => playable.find((entry) => entry.id === id)).filter(Boolean) as M3UEntry[],
    [recentIds, playable],
  );

  useEffect(() => {
    if (filtered.length) {
      setCurrent((existing) => (existing && filtered.some((entry) => entry.id === existing.id) ? existing : filtered[0]));
    } else {
      setCurrent(null);
    }
  }, [playlistUrl, filtered.length, showOnlyFavorites]);

  function selectMode(next: Mode) {
    setMode(next);
    setSearch('');
    setShowOnlyFavorites(false);
    setSidebarOpen(false);
  }

  function selectChannel(channel: M3UEntry) {
    setCurrent(channel);
    setRecentIds((previous) => {
      const next = [channel.id, ...previous.filter((id) => id !== channel.id)].slice(0, 12);
      setStoredArray(RECENTS_KEY, next);
      return next;
    });
    setSidebarOpen(false);
  }

  function toggleFavorite(channel: M3UEntry) {
    setFavoriteIds((previous) => {
      const next = previous.includes(channel.id)
        ? previous.filter((id) => id !== channel.id)
        : [channel.id, ...previous];
      setStoredArray(FAVORITES_KEY, next);
      return next;
    });
  }

  function saveCustomUrl(raw: string) {
    const url = raw.trim();
    if (!isValidPlaylistUrl(url)) {
      window.alert('Please enter a valid http(s) playlist URL.');
      return;
    }
    setCustomUrl(url);
    setCustomDraft(url);
    window.localStorage.setItem(CUSTOM_URL_KEY, url);
    selectMode({ kind: 'custom', url });
  }

  function selectAdultMode() {
    if (!showAdult) {
      const ok = window.confirm('Adult content (18+). You confirm you are of legal age in your jurisdiction. Continue?');
      if (!ok) return;
      setShowAdult(true);
    }
    selectMode({ kind: 'category', slug: 'xxx', label: 'Adult' });
  }

  function playNext() {
    if (!current || filtered.length === 0) return;
    const idx = filtered.findIndex((entry) => entry.id === current.id);
    const next = filtered[idx + 1] || filtered[0];
    if (next && next.id !== current.id) selectChannel(next);
  }

  const activeModeKey = mode.kind === 'country' ? 'country' : mode.kind === 'category' ? mode.slug : 'custom';
  const currentIsFavorite = !!current && favoriteIds.includes(current.id);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark"><Waves size={23} /></div>
            <div>
              <h1>OpenAir TV</h1>
              <p>Public live streams, without the Lovable baggage.</p>
            </div>
          </div>
          <button className="mobile-list-button" onClick={() => setSidebarOpen(true)}>
            <Tv size={18} /> Channels
          </button>
        </div>

        <div className="mode-row" aria-label="Playlist mode">
          <button className={activeModeKey === 'country' ? 'tab active' : 'tab'} onClick={() => selectMode({ kind: 'country', code: DEFAULT_COUNTRY })}>
            <Globe2 size={17} /> Live TV
          </button>
          <button className={activeModeKey === 'sports' ? 'tab active' : 'tab'} onClick={() => selectMode({ kind: 'category', slug: 'sports', label: 'Sports' })}>
            ⚽ Sports
          </button>
          <button className={activeModeKey === 'xxx' ? 'tab active' : 'tab'} onClick={selectAdultMode}>
            Adult
          </button>
          <button className={activeModeKey === 'custom' ? 'tab active' : 'tab'} onClick={() => selectMode({ kind: 'custom', url: customUrl })}>
            <Upload size={16} /> Custom
          </button>
        </div>

        <div className="controls-row">
          {mode.kind === 'country' && (
            <label className="field compact">
              <span>Country</span>
              <select value={mode.code} onChange={(event) => selectMode({ kind: 'country', code: event.target.value })}>
                {sortedCountries.map((country) => (
                  <option key={country.code} value={country.code.toLowerCase()}>
                    {country.flag ? `${country.flag} ` : ''}{country.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode.kind === 'custom' && (
            <form className="custom-form" onSubmit={(event) => { event.preventDefault(); saveCustomUrl(customDraft || customUrl); }}>
              <label className="field grow">
                <span>Custom M3U playlist URL</span>
                <input
                  value={customDraft}
                  onChange={(event) => setCustomDraft(event.target.value)}
                  placeholder="https://example.com/playlist.m3u"
                />
              </label>
              <button className="primary-button" type="submit">Load</button>
            </form>
          )}
        </div>

        <div className="player-card">
          {current ? (
            <Player key={current.url} entry={current} onError={playNext} />
          ) : (
            <div className="empty-player">
              <Tv size={42} />
              <p>{isLoading ? 'Loading channels…' : playlistError || 'No playable channels found.'}</p>
            </div>
          )}
        </div>

        <div className="now-playing">
          <div className="channel-logo-large">
            {current?.logo ? <img src={current.logo} alt="" onError={(event) => ((event.currentTarget.style.display = 'none'))} /> : <Tv size={24} />}
          </div>
          <div className="now-copy">
            <span>{modeLabel(mode, countries)}</span>
            <h2>{current?.name || 'No channel selected'}</h2>
            <p>{current?.group || (countriesError || 'Choose a country, category, or custom playlist.')}</p>
          </div>
          {current && (
            <button className={currentIsFavorite ? 'icon-button favorite active' : 'icon-button favorite'} onClick={() => toggleFavorite(current)} title="Toggle favorite">
              <Star size={19} fill={currentIsFavorite ? 'currentColor' : 'none'} />
            </button>
          )}
          <span className="live-pill">LIVE</span>
        </div>
      </section>

      <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-header">
          <div>
            <h3>Channels</h3>
            <p>{isLoading ? 'Loading…' : `${filtered.length} available`}</p>
          </div>
          <button className="close-sidebar" onClick={() => setSidebarOpen(false)}><X size={21} /></button>
        </div>

        <div className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search channel or group" />
        </div>

        <div className="list-tools">
          <button className={showOnlyFavorites ? 'chip active' : 'chip'} onClick={() => setShowOnlyFavorites((value) => !value)}>
            <Star size={15} /> Favorites
          </button>
          <span className="muted-note">{playable.length} playable / {entries.length} total</span>
        </div>

        {recentChannels.length > 0 && !search && !showOnlyFavorites && (
          <section className="recent-block">
            <h4>Recently watched</h4>
            <div className="recent-row">
              {recentChannels.slice(0, 6).map((channel) => (
                <button key={channel.id} onClick={() => selectChannel(channel)} title={channel.name}>
                  {channel.logo ? <img src={channel.logo} alt="" onError={(event) => ((event.currentTarget.style.display = 'none'))} /> : <Tv size={16} />}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="channel-list">
          {filtered.map((channel) => {
            const active = current?.id === channel.id;
            const favorite = favoriteIds.includes(channel.id);
            return (
              <button key={channel.id} className={active ? 'channel active' : 'channel'} onClick={() => selectChannel(channel)}>
                <span className="channel-logo">
                  {channel.logo ? <img src={channel.logo} alt="" onError={(event) => ((event.currentTarget.style.display = 'none'))} /> : <Tv size={17} />}
                </span>
                <span className="channel-copy">
                  <strong>{channel.name}</strong>
                  {channel.group && <small>{channel.group}</small>}
                </span>
                {favorite && <Star size={14} className="small-star" fill="currentColor" />}
              </button>
            );
          })}

          {!isLoading && filtered.length === 0 && (
            <div className="empty-list">No channels found. Try another country or clear the search.</div>
          )}
        </div>
      </aside>
    </main>
  );
}

function Player({ entry, onError }: { entry: M3UEntry; onError: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let errored = false;

    const handleError = () => {
      if (errored) return;
      errored = true;
      onError();
    };

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = entry.url;
      video.addEventListener('error', handleError);
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(entry.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) handleError();
      });
    } else {
      video.src = entry.url;
      video.addEventListener('error', handleError);
    }

    video.play().catch(() => {
      // Browsers may block autoplay with sound. Controls remain visible.
    });

    return () => {
      video.removeEventListener('error', handleError);
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [entry.url, onError]);

  return <video ref={videoRef} controls playsInline autoPlay className="video-player" />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
