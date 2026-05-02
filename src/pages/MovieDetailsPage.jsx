import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { supabase } from '../supabaseClient';
import { motion } from "framer-motion";
import MovieModal from "../components/MovieModal";
import { usePlayer } from "../context/PlayerContext";

const TMDB_TOKEN = import.meta.env.VITE_TMDB_ACCESS_TOKEN;
const TMDB_BASE = "https://api.themoviedb.org/3";
const AUTH_HEADERS = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  accept: "application/json",
};

const safeJson = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const fetchTMDB = async (endpoint) => {
  const url = `${TMDB_BASE}/${endpoint}`;
  const res = await fetch(url, { headers: AUTH_HEADERS });
  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(`TMDB ${res.status}: ${JSON.stringify(body)}`);
  }
  return res.json();
};

const tryRecommendationsAndSimilar = async (mediaType, id) => {
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
    const discover = await fetchTMDB(`${mediaType}/popular?language=en-US&page=1`);
    if (discover?.results?.length) return discover.results;
  } catch (e) {
    console.warn("discover/popular fallback failed:", e.message);
  }

  return [];
};

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

function MovieDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { playVideo } = usePlayer();

  const [movie, setMovie] = useState(location.state?.movie || null);
  const [recommended, setRecommended] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [loading, setLoading] = useState(!location.state?.movie);

  const handleWatchNow = async () => {
    if (!movie) return;

    // We prioritize Vidking integration using TMDB ID
    playVideo({
      id: movie.id,
      type: mediaType,
      season: 1, // Default for now, can be expanded for series
      episode: 1
    });

    // Optional: Log analytics or check Supabase for custom links
    try {
      const { data, error } = await supabase
        .from('movie_links')
        .select('video_url')
        .eq('tmdb_id', String(movie.id))
        .single();
      
      if (data?.video_url) {
        console.log('Custom video URL found in Supabase:', data.video_url);
      }
    } catch (err) {
      console.warn('Supabase link check failed:', err);
    }
  };

  // Debug log incoming object (remove after tests)
  useEffect(() => {
    console.log("MovieDetails received movie object:", movie);
  }, [movie]);

  const inferredType = location.pathname.includes("/series") || location.pathname.includes("/tv") ? "tv" : "movie";
  const mediaType = location.state?.mediaType || location.state?.movie?.media_type || (location.state?.movie?.first_air_date ? "tv" : "movie") || inferredType;

  // Fetch details if needed
  useEffect(() => {
    let mounted = true;
    const needsFetch = !movie || !movie.backdrop_path || !movie.genres;

    const fetchDetails = async () => {
      if (!needsFetch) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchTMDB(`${mediaType}/${id}?language=en-US`);
        if (!mounted) return;
        setMovie({ ...data, media_type: mediaType });
      } catch (err) {
        console.error("Error fetching movie details:", err.message || err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDetails();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mediaType]);

  // Fetch recommendations/similar
  useEffect(() => {
    let mounted = true;
    const fetchRecs = async () => {
      try {
        const results = await tryRecommendationsAndSimilar(mediaType, id);
        if (!mounted) return;
        const normalized = (results || []).map((r) => ({
          ...r,
          media_type: r.media_type || (r.first_air_date ? "tv" : r.release_date ? "movie" : mediaType),
        }));
        setRecommended(normalized.slice(0, 12));
      } catch (err) {
        console.error("Error fetching recommendations:", err.message || err);
        setRecommended([]);
      }
    };
    fetchRecs();
    return () => {
      mounted = false;
    };
  }, [id, mediaType]);

  // Click recommended: update state immediately and navigate with state
  const handleRecommendClick = (rec) => {
    const recType = rec.media_type || (rec.first_air_date ? "tv" : rec.release_date ? "movie" : mediaType);
    const path = `/${recType === "tv" ? "series" : "movie"}/${rec.id}`;

    setMovie({ ...rec, media_type: recType });
    setLoading(false);
    window.scrollTo({ top: 0, behavior: "smooth" });

    navigate(path, {
      state: { movie: { ...rec, media_type: recType }, mediaType: recType },
    });
  };

  if (loading || !movie) {
    return (
      <div className="flex justify-center items-center h-[60vh] text-gray-400 text-lg">
        Loading movie...
      </div>
    );
  }

  const { poster: resolvedPoster, backdrop: resolvedBackdrop } = resolveImageUrls(movie);
  const heroImage = resolvedBackdrop || resolvedPoster || "https://via.placeholder.com/1280x720?text=No+Image";
  const posterImage = resolvedPoster || resolvedBackdrop || "https://via.placeholder.com/300x450?text=No+Poster";

  const title = movie.title || movie.name;
  const releaseDate = movie.release_date || movie.first_air_date;
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";

  return (
    <div className="bg-black text-white min-h-screen">
      {/* HERO */}
      <div className="relative w-full h-[50vh] sm:h-[60vh] md:h-[70vh] flex items-center justify-center bg-black overflow-hidden">
        <img src={heroImage} alt={title} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <motion.div className="relative z-10 p-4 sm:p-6 md:p-10 max-w-3xl" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3">{title}</h1>
          <p className="text-gray-300 text-sm sm:text-base line-clamp-2 sm:line-clamp-3 mb-5">{movie.overview || "No description available."}</p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button onClick={() => setIsModalOpen(true)} className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-md font-semibold min-h-[44px]">Watch Trailer</button>
            <button onClick={handleWatchNow} className="bg-white text-black hover:bg-gray-200 px-6 py-3 rounded-md font-semibold min-h-[44px]">Watch Now</button>
          </div>
        </motion.div>
      </div>

      <div className="flex justify-end pr-4 sm:pr-10 mt-4">
        <button className="text-red-500 font-semibold text-base sm:text-lg underline hover:text-red-400 min-h-[44px] px-2">Download</button>
      </div>

      {/* INFO */}
      <div className="flex flex-col md:flex-row gap-6 sm:gap-8 px-4 sm:px-6 md:px-10 py-6 sm:py-10">
        <img src={posterImage} alt={title} className="w-full sm:w-[200px] md:w-[250px] rounded-lg shadow-lg mx-auto md:mx-0" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{title}</h1>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-yellow-400 text-lg">★</span>
            <p className="text-gray-300">{rating} / 10</p>
            <span className="mx-2 text-gray-500">•</span>
            <p className="text-gray-400">{releaseDate?.split("-")[0]}</p>
          </div>
          <p className="text-gray-400 mb-3 text-sm sm:text-base">{movie.genres?.map((g) => g.name).join(", ")}</p>
          <p className="text-gray-300 leading-relaxed max-w-3xl text-sm sm:text-base">{movie.overview}</p>
        </div>
      </div>

      {/* RECOMMENDED */}
      {recommended.length > 0 && (
        <div className="px-4 sm:px-6 md:px-10 pb-10">
          <h2 className="text-xl sm:text-2xl font-semibold mb-5">You may also like</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
            {recommended.map((rec) => (
              <div key={`${rec.id}_${rec.media_type}`} onClick={() => handleRecommendClick(rec)} className="relative group cursor-pointer">
                <img src={rec.poster_path ? `https://image.tmdb.org/t/p/w500${rec.poster_path}` : (rec.poster || "https://via.placeholder.com/300x450?text=No+Poster")} alt={rec.title || rec.name} className="rounded-lg w-full h-[180px] sm:h-[220px] md:h-[250px] object-cover group-hover:opacity-75 transition" />
                <p className="mt-2 text-xs sm:text-sm text-gray-300 truncate">{rec.title || rec.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <MovieModal movie={movie} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

export default MovieDetailsPage;