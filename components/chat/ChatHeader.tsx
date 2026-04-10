'use client';

import { useState } from 'react';
import { Hash, Users, Pin, Search, AtSign, HelpCircle, Menu } from 'lucide-react';
import SearchModal from './SearchModal';
import MentionsDropdown from './MentionsDropdown';
import NotificationDropdown from './NotificationDropdown';
import ChannelSettingsModal from './ChannelSettingsModal';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import { useMobile } from '@/components/layout/MobileContext';

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
  const { toggleSidebar } = useMobile();

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
      <header className="h-12 px-3 flex items-center justify-between border-b border-black/20 shadow-sm bg-chat-bg shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Hamburger — mobile only */}
          <button
            onClick={toggleSidebar}
            className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <h1 className="font-semibold truncate">{channel.name}</h1>
          {channel.description && (
            <>
              <span className="hidden sm:block w-px h-4 bg-gray-600 mx-2 flex-shrink-0" />
              <p className="hidden sm:block text-sm text-gray-400 truncate max-w-md">
                {channel.description}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-4 relative flex-shrink-0">
          <button
            onClick={() => setPinnedOpen(!pinnedOpen)}
            className={`hidden sm:block text-gray-400 hover:text-gray-200 ${pinnedOpen ? 'text-yellow-500' : ''}`}
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

          <div className="relative hidden sm:block">
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
          {/* Search icon-only on mobile */}
          <button
            onClick={() => setSearchOpen(true)}
            className="sm:hidden text-gray-400 hover:text-gray-200"
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          <div className="relative hidden sm:block">
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
          <button className="hidden sm:block text-gray-400 hover:text-gray-200" title="Help">
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
