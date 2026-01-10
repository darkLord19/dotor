
'use client';

import { GlobalSidebar } from '@/components/GlobalSidebar';
import styles from './layout.module.css';

export default function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className={styles.container}>
            <GlobalSidebar />
            <main className={styles.content}>
                {children}
            </main>
        </div>
    );
}
