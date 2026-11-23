import { reddit } from '@devvit/web/server';
import { getTodayDateString } from '../../shared/generator';

export const createPost = async () => {
  const dateStr = getTodayDateString();
  return await reddit.submitCustomPost({
    title: `SAVIOR Daily [${dateStr}] — Tactical Stealth Extraction`,
  });
};
