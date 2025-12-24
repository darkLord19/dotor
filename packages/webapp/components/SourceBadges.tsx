'use client';

import styles from './SourceBadges.module.css';

interface Citation {
  source: string;
  content: string;
  id: string;
}

interface SourceBadgesProps {
  citations: Citation[];
}

const sourceIcons: Record<string, string> = {
  gmail: '📧',
  calendar: '📅',
  linkedin: '💼',
  whatsapp: '💬',
};

const sourceLabels: Record<string, string> = {
  gmail: 'Gmail',
  calendar: 'Calendar',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
};

export function SourceBadges({ citations }: SourceBadgesProps) {
  // Group citations by source
  const grouped = citations.reduce<Record<string, Citation[]>>((acc, citation) => {
    const existing = acc[citation.source];
    if (existing) {
      existing.push(citation);
    } else {
      acc[citation.source] = [citation];
    }
    return acc;
  }, {});

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>Sources</h4>
      <div className={styles.badges}>
        {Object.entries(grouped).map(([source, items]) => (
          <button 
            key={source} 
            className={`${styles.badge} ${styles[source]}`}
            onClick={() => {
              // Could expand to show citations
            }}
          >
            <span className={styles.icon}>{sourceIcons[source] ?? '📄'}</span>
            <span className={styles.label}>{sourceLabels[source] ?? source}</span>
            <span className={styles.count}>{items.length}</span>
          </button>
        ))}
      </div>
      <div className={styles.citationList}>
        {citations.map((citation, index) => (
          <div key={citation.id || index} className={styles.citation}>
            <span className={styles.citationNumber}>[{index + 1}]</span>
            <span className={styles.citationContent}>{citation.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

