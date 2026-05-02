import React, { createContext, useState, useContext } from 'react';

const PlayerContext = createContext();

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};

export const PlayerProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [videoData, setVideoData] = useState({ url: '', id: '', type: '', season: 1, episode: 1 });

  const playVideo = (data) => {
    if (typeof data === 'string') {
      setVideoData({ url: data, id: '', type: '', season: 1, episode: 1 });
    } else {
      setVideoData({
        url: data.url || '',
        id: data.id || '',
        type: data.type || '',
        season: data.season || 1,
        episode: data.episode || 1
      });
    }
    setIsOpen(true);
  };

  const closeVideo = () => {
    setIsOpen(false);
    setVideoData({ url: '', id: '', type: '', season: 1, episode: 1 });
  };

  const value = {
    isOpen,
    videoUrl: videoData.url,
    videoData,
    playVideo,
    closeVideo,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
};
