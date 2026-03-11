'use client';

import { useState } from 'react';
import { Hash, Users, Pin, Search, AtSign, HelpCircle, Settings } from 'lucide-react';
import SearchModal from './SearchModal';
import MentionsDropdown from './MentionsDropdown';
import NotificationDropdown from './NotificationDropdown';
import ChannelSettingsModal from './ChannelSettingsModal';
import PinnedMessagesPanel from './PinnedMessagesPanel';

interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
}

interface ChatHeaderProps {
  channel: Channel;
}

export default function ChatHeader({ channel }: ChatHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'about' | 'members'>('about');
  const [pinnedOpen, setPinnedOpen] = useState(false);

  const openMembersPanel = () => {
    setSettingsDefaultTab('members');
    setSettingsOpen(true);
  };

  const openSettings = () => {
    setSettingsDefaultTab('about');
    setSettingsOpen(true);
  };

  const handleSearchFocus = () => {
    setSearchOpen(true);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.length >= 2) {
      setSearchOpen(true);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.length >= 2) {
      setSearchOpen(true);
    }
  };

  return (
    <>
      <header className="h-12 px-4 flex items-center justify-between border-b border-black/20 shadow-sm bg-chat-bg">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-gray-400" />
          <h1 className="font-semibold">{channel.name}</h1>
          {channel.description && (
            <>
              <span className="w-px h-4 bg-gray-600 mx-2" />
              <p className="text-sm text-gray-400 truncate max-w-md">
                {channel.description}
              </p>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-4 relative">
          <button 
            onClick={() => setPinnedOpen(!pinnedOpen)}
            className={`text-gray-400 hover:text-gray-200 ${pinnedOpen ? 'text-yellow-500' : ''}`} 
            title="Pinned Messages"
          >
            <Pin className="w-5 h-5" />
          </button>
          <PinnedMessagesPanel
            channelId={channel.id}
            isOpen={pinnedOpen}
            onClose={() => setPinnedOpen(false)}
          />
          <NotificationDropdown
            isOpen={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            onOpenChange={setNotificationsOpen}
          />
          <button 
            onClick={openMembersPanel}
            className="text-gray-400 hover:text-gray-200" 
            title="Member List"
          >
            <Users className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={handleSearchFocus}
              onKeyDown={handleSearchKeyDown}
              className="w-36 bg-[#202225] rounded pl-8 pr-2 py-1 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:w-48 transition-all"
            />
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setMentionsOpen(!mentionsOpen)}
              className={`text-gray-400 hover:text-gray-200 ${mentionsOpen ? 'text-primary' : ''}`}
              title="Mentions"
            >
              <AtSign className="w-5 h-5" />
            </button>
            <MentionsDropdown
              isOpen={mentionsOpen}
              onClose={() => setMentionsOpen(false)}
            />
          </div>
          <button className="text-gray-400 hover:text-gray-200" title="Help">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </header>

      <SearchModal
        isOpen={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchQuery('');
        }}
        initialQuery={searchQuery}
      />

      {settingsOpen && (
        <ChannelSettingsModal
          channel={channel}
          defaultTab={settingsDefaultTab}
          onClose={() => setSettingsOpen(false)}
          onUpdate={(updated) => {
            // Channel updates would need to be handled by parent - for now just close
            setSettingsOpen(false);
          }}
          onDelete={() => {
            // Would need navigation - for now just close
            setSettingsOpen(false);
          }}
        />
      )}
    </>
  );
}
