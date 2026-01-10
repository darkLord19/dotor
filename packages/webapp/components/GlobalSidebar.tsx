
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  User,
  LogOut,
  Link as LinkIcon
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import styles from './GlobalSidebar.module.css';

export function GlobalSidebar() {
  const pathname = usePathname();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Helper to determine active state
  const isActive = (path: string) => {
    if (path === '/dashboard') return pathname === '/dashboard';
    if (path === '/connections') return pathname?.startsWith('/connections');
    if (path === '/profile') return pathname?.startsWith('/profile');

    return false;
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/signout', { method: 'POST' });
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header className={styles.sidebar}>
      <Link href="/dashboard" className={styles.logo} title="Home">
        <span style={{ fontWeight: 900 }}>Blaiso</span>
      </Link>

      <nav className={styles.nav}>
        {/* Main navigation links can go here if needed later */}
      </nav>

      <div className={styles.bottomNav} ref={menuRef}>
        <Link
          href="/connections"
          className={`${styles.navItem} ${isActive('/connections') ? styles.navItemActive : ''}`}
          title="Connections"
        >
          <LinkIcon size={20} />
        </Link>
        <div className={styles.profileContainer}>
          <button
            className={styles.avatar}
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            title="Account"
          >
            <User size={20} />
          </button>

          {showProfileMenu && (
            <div className={styles.profileMenu}>
              <Link href="/profile" className={styles.profileMenuItem} onClick={() => setShowProfileMenu(false)}>
                <User size={16} />
                <span>View Profile</span>
              </Link>
              <div className={styles.profileMenuDivider} />
              <button className={`${styles.profileMenuItem} ${styles.profileMenuItemLogout}`} onClick={handleLogout}>
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
