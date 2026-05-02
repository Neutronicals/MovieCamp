import React from 'react';
import { usePlayer } from '../context/PlayerContext';
import StreamingModal from './StreamingModal';

const GlobalPlayer = () => {
    const { isOpen, closeVideo, videoData } = usePlayer();

    return (
        <StreamingModal
            isOpen={isOpen}
            onClose={closeVideo}
            videoData={videoData}
        />
    );
};

export default GlobalPlayer;
