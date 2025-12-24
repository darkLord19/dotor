'use client';

import styles from './AnswerCard.module.css';

interface Answer {
  answer: string;
  citations: Array<{
    source: string;
    content: string;
    id: string;
  }>;
  confidence: number;
  insufficient: boolean;
}

interface AnswerCardProps {
  answer: Answer;
}

export function AnswerCard({ answer }: AnswerCardProps) {
  if (answer.insufficient) {
    return (
      <div className={`${styles.card} ${styles.insufficient}`}>
        <div className={styles.insufficientIcon}>🔍</div>
        <p className={styles.insufficientText}>
          {answer.answer}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.content}>
        <p className={styles.answer}>{answer.answer}</p>
      </div>
    </div>
  );
}

