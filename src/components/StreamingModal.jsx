import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VideoPlayer from './VideoPlayer';

const StreamingModal = ({ isOpen, onClose, videoData }) => {
    const playerRef = useRef(null);
    const { id, type, season, episode, url } = videoData || {};

    // Construct Vidking URL if ID is available
    const isVidking = !!id;
    const vidkingUrl = isVidking 
        ? type === 'tv' 
            ? `https://www.vidking.net/embed/tv/${id}/${season}/${episode}?color=0dcaf0&autoPlay=true&episodeSelector=true`
            : `https://www.vidking.net/embed/movie/${id}?color=0dcaf0&autoPlay=true`
        : null;

    useEffect(() => {
        if (isVidking) {
            const handleMessage = (event) => {
                try {
                    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                    if (data.type === 'PLAYER_EVENT') {
                        console.log('Vidking Player Event:', data.data);
                        // You can handle progress tracking here
                    }
                } catch (e) {
                    // Ignore non-JSON messages
                }
            };
            window.addEventListener('message', handleMessage);
            return () => window.removeEventListener('message', handleMessage);
        }
    }, [isVidking]);

    const videoJsOptions = {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        sources: [{
            src: url || 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            type: 'video/mp4'
        }]
    };

    const handlePlayerReady = (player) => {
        playerRef.current = player;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 bg-black z-50 flex items-center justify-center"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="relative w-full max-w-6xl mx-4 bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 z-20 text-white hover:text-red-500 transition-colors bg-black/50 rounded-full p-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <div className="w-full aspect-video">
                            {isVidking ? (
                                <iframe
                                    src={vidkingUrl}
                                    className="w-full h-full border-0"
                                    allowFullScreen
                                    title="Vidking Player"
                                />
                            ) : (
                                <VideoPlayer options={videoJsOptions} onReady={handlePlayerReady} />
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default StreamingModal;
