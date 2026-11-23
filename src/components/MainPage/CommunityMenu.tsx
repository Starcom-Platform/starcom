import React, { useEffect, useRef, useState } from 'react';
import { Menu, MenuItem } from '@mui/material';
import { Users } from 'lucide-react';
import { useDiscordStats } from '../../hooks/useDiscordStats';
import DiscordWidget from '../Discord/DiscordWidget';
import TelegramWidget from '../Telegram/TelegramWidget';
import GitHubWidget from '../GitHub/GitHubWidget';
import { fill, numbered, useMessages } from '../../i18n/app/i18n';

type Place = 'discord' | 'telegram' | 'github';

/**
 * The community, behind one button (plan item 4.5, decision D5): Discord, the
 * Telegram group and the source code. They were three header buttons, kept for
 * grant applications and reused by the support drive.
 *
 * Discord's online count is fetched while this menu is open, and only then. The
 * header fetched it on every page load and every two minutes after, and the
 * closed Discord widget did the same, for a number nobody had asked to see.
 */
const CommunityMenu: React.FC<{ className?: string }> = ({ className }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState<Place | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const menuOpen = anchor !== null;
  const { onlineCount, error, lastUpdated } = useDiscordStats({ autoRefresh: menuOpen });
  const { m: { header: t } } = useMessages();

  const discordLabel = error
    ? t.discordUnavailable
    : lastUpdated
      ? fill(t.discordOnline, { n: numbered(onlineCount) })
      : t.discordCounting;

  const choose = (place: Place) => {
    setAnchor(null);
    setOpen(place);
  };

  // An open widget closes on a click outside it, as the header's three did.
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[class*="Widget"]') || container.current?.contains(target)) return;
      setOpen(null);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  return (
    <div ref={container} style={{ position: 'relative' }}>
      <button
        type="button"
        className={className}
        aria-label={t.community}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={t.community}
        onClick={(event) => {
          setOpen(null);
          setAnchor(menuOpen ? null : event.currentTarget);
        }}
      >
        <Users size={20} />
      </button>
      <Menu anchorEl={anchor} open={menuOpen} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => choose('discord')}>{discordLabel}</MenuItem>
        <MenuItem onClick={() => choose('telegram')}>{t.telegram}</MenuItem>
        <MenuItem onClick={() => choose('github')}>{t.github}</MenuItem>
      </Menu>
      <DiscordWidget isOpen={open === 'discord'} onClose={() => setOpen(null)} />
      <TelegramWidget isOpen={open === 'telegram'} onClose={() => setOpen(null)} />
      <GitHubWidget isOpen={open === 'github'} onClose={() => setOpen(null)} />
    </div>
  );
};

export default CommunityMenu;
