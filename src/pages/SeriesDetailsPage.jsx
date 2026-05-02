import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import MovieModal from "../components/MovieModal";
import { usePlayer } from "../context/PlayerContext";

const TMDB_TOKEN = import.meta.env.VITE_TMDB_ACCESS_TOKEN;
const TMDB_BASE = "https://api.themoviedb.org/3";
const AUTH_HEADERS = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  accept: "application/json",
};

// Helper: safe JSON body for error messages
const safeJson = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// Fetch wrapper with helpful error text
const fetchTMDB = async (endpoint) => {
  const url = `${TMDB_BASE}/${endpoint}`;
  const res = await fetch(url, { headers: AUTH_HEADERS });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(`TMDB ${res.status}: ${JSON.stringify(body)}`);
  }
  return res.json();
};

// Try recommendations -> similar -> discover/popular fallback
const tryRecommendationsAndSimilar = async (mediaType, id, genresForFallback = []) => {
  try {
    const rec = await fetchTMDB(`${mediaType}/${id}/recommendations?language=en-US&page=1`);
    if (rec?.results?.length) return rec.results;
  } catch (e) {
    console.warn("recommendations failed:", e.message);
  }

  try {
    const sim = await fetchTMDB(`${mediaType}/${id}/similar?language=en-US&page=1`);
    if (sim?.results?.length) return sim.results;
  } catch (e) {
    console.warn("similar failed:", e.message);
  }

  try {
    // Best-effort fallback: popular list for the mediaType
    const discover = await fetchTMDB(`${mediaType}/popular?language=en-US&page=1`);
    if (discover?.results?.length) return discover.results;
  } catch (e) {
    console.warn("discover/popular fallback failed:", e.message);
  }

  return [];
};

// Normalize image fields to full URLs (accepts poster_path/backdrop_path or full URLs)
const resolveImageUrls = (item) => {
  const base = "https://image.tmdb.org/t/p";
  const poster =
    item?.poster && typeof item.poster === "string" && item.poster.startsWith("http")
      ? item.poster
      : item?.poster_path
      ? `${base}/w500${item.poster_path}`
      : item?.posterUrl
      ? item.posterUrl
      : null;

  const backdrop =
    item?.backdrop && typeof item.backdrop === "string" && item.backdrop.startsWith("http")
      ? item.backdrop
      : item?.backdrop_path
      ? `${base}/original${item.backdrop_path}`
      : item?.backdropUrl
      ? item.backdropUrl
      : poster;

  return { poster, backdrop };
};

const SeriesDetailsPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { playVideo } = usePlayer();

  // Use passed state immediately if present
  const [series, setSeries] = useState(location.state?.movie || null);
  const inferredType = location.pathname.includes("/series") ? "tv" : "movie";
  const mediaType = location.state?.mediaType || inferredType;

  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [similarShows, setSimilarShows] = useState([]);
  const [showTrailer, setShowTrailer] = useState(false);
  const [loading, setLoading] = useState(!location.state?.movie);

  // Debugging: log incoming series object so you can see keys (remove later)
  useEffect(() => {
    console.log("SeriesDetails received series object:", series);
  }, [series]);

  // Fetch details when missing or id changes
  useEffect(() => {
    let mounted = true;
    const needsFetch = !series || !series.backdrop_path || !series.genres;

    const fetchSeriesDetails = async () => {
      if (!needsFetch) {
        setSeasons(series.seasons || []);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchTMDB(`${mediaType}/${id}?language=en-US`);
        if (!mounted) return;
        setSeries({ ...data, media_type: "tv" });
        setSeasons(data.seasons || []);
      } catch (err) {
        console.error("Error fetching series details:", err.message || err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSeriesDetails();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mediaType]);

  // Fetch episodes for selected season
  useEffect(() => {
    let mounted = true;
    const fetchEpisodes = async () => {
      if (!selectedSeason) return;
      try {
        const data = await fetchTMDB(`tv/${id}/season/${selectedSeason}?language=en-US`);
        if (!mounted) return;
        setEpisodes(data.episodes || []);
      } catch (err) {
        console.error("Error fetching episodes:", err.message || err);
      }
    };
    fetchEpisodes();
    return () => {
      mounted = false;
    };
  }, [id, selectedSeason]);

  // Fetch similar/recommendations safely with fallback
  useEffect(() => {
    let mounted = true;
    const fetchSimilar = async () => {
      try {
        const genresForFallback = (series?.genres || []).map((g) => g.id);
        const results = await tryRecommendationsAndSimilar(mediaType, id, genresForFallback);
        if (!mounted) return;
        const normalized = (results || []).map((r) => ({
          ...r,
          media_type: r.media_type || (r.first_air_date ? "tv" : r.release_date ? "movie" : mediaType),
        }));
        setSimilarShows(normalized);
      } catch (err) {
        console.error("Error fetching similar shows:", err.message || err);
        setSimilarShows([]);
      }
    };
    fetchSimilar();
    return () => {
      mounted = false;
    };
  }, [id, mediaType, series?.genres]);

  // Clicking a similar item: update UI immediately and navigate with full object
  const handleSimilarClick = (show) => {
    const recType = show.media_type || (show.first_air_date ? "tv" : show.release_date ? "movie" : "tv");
    const path = `/${recType === "tv" ? "series" : "movie"}/${show.id}`;

    setSeries({ ...show, media_type: recType });
    setLoading(false);
    setSeasons(show.seasons || []);
    setEpisodes([]);
    window.scrollTo({ top: 0, behavior: "smooth" });

    navigate(path, {
      state: { movie: { ...show, media_type: recType }, mediaType: recType },
    });
  };

  if (loading || !series)
    return (
      <p className="text-center py-20 text-gray-400">Loading series details...</p>
    );

  // Resolve images from whatever shape the object has
  const { poster: resolvedPoster, backdrop: resolvedBackdrop } = resolveImageUrls(series);
  const heroImage = resolvedBackdrop || resolvedPoster || "/placeholder.jpg";
  const posterImage = resolvedPoster || resolvedBackdrop || "/placeholder.jpg";

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 pt-20">
      {/* Header */}
      <div className="relative w-full h-[50vh] sm:h-[70vh] overflow-hidden rounded-2xl shadow-lg">
        <img src={heroImage} alt={series.name} className="w-full h-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent flex flex-col justify-end px-6 sm:px-12 pb-8">
          <h1 className="text-3xl sm:text-5xl font-bold mb-4">{series.name || series.title}</h1>
          <div className="flex gap-4">
            <button onClick={() => setShowTrailer(true)} className="bg-cinema-red text-white px-6 py-2 rounded-lg hover:bg-red-700 transition">
              Watch Trailer
            </button>
            <button onClick={() => playVideo({ id: series.id, type: 'tv', season: selectedSeason, episode: 1 })} className="bg-white text-black px-6 py-2 rounded-lg hover:bg-gray-300 transition">
              Watch Now
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-10 flex flex-col sm:flex-row gap-8">
        <img src={posterImage} alt={series.name} className="rounded-lg shadow-lg w-48 sm:w-60" />
        <div>
          <p className="text-gray-400 text-sm mb-2">{series.first_air_date?.split("-")[0] || "N/A"}</p>
          <p className="text-gray-300 leading-relaxed">{series.overview}</p>
          <p className="mt-3 text-yellow-400">⭐ {series.vote_average?.toFixed(1) || "N/A"}</p>
          <p className="text-gray-500">Genres: {series.genres?.map((g) => g.name).join(", ") || "Unknown"}</p>
        </div>
      </div>

      {/* Seasons */}
      {seasons.length > 0 && (
        <div className="mt-10">
          <label className="block text-lg font-semibold mb-2">Select Season:</label>
          <select value={selectedSeason} onChange={(e) => setSelectedSeason(Number(e.target.value))} className="bg-gray-900 border border-gray-700 px-3 py-2 rounded-lg">
            {seasons.map((season) => (
              <option key={season.id} value={season.season_number}>{season.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Episodes */}
      {episodes.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold mb-4">Season {selectedSeason} Episodes</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {episodes.map((ep) => (
              <div key={ep.id} onClick={() => playVideo({ id: series.id, type: 'tv', season: selectedSeason, episode: ep.episode_number })} className="bg-gray-800 hover:bg-gray-700 transition p-3 rounded-lg text-center cursor-pointer">
                <p className="font-semibold">{ep.name || `Episode ${ep.episode_number}`}</p>
                <p className="text-gray-400 text-sm">Ep {ep.episode_number}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Similar */}
      {similarShows.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4">You may also like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {similarShows.map((show) => (
              <div key={`${show.id}_${show.media_type}`} onClick={() => handleSimilarClick(show)} className="cursor-pointer">
                <img src={show.poster_path ? `https://image.tmdb.org/t/p/w300${show.poster_path}` : (show.poster || "/placeholder.jpg")} alt={show.name || show.title} className="rounded-lg hover:scale-105 transition" />
                <p className="mt-2 text-sm text-center">{show.name || show.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <MovieModal movie={{ ...series, id: series.id, media_type: "tv" }} isOpen={showTrailer} onClose={() => setShowTrailer(false)} />
    </div>
  );
};

export default SeriesDetailsPage;