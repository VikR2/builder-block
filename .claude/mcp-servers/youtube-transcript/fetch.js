#!/usr/bin/env node
/**
 * Simple YouTube transcript fetcher
 * Usage: node fetch.js <youtube-url>
 */

import { YoutubeTranscript } from 'youtube-transcript';

async function main() {
    const url = process.argv[2];

    if (!url) {
        console.error('Usage: node fetch.js <youtube-url>');
        process.exit(1);
    }

    try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        const fullText = transcript.map(item => item.text).join(' ');

        const result = {
            transcript: fullText,
            segments: transcript.length,
            duration_seconds: Math.round((transcript[transcript.length - 1]?.offset || 0) / 1000),
            character_count: fullText.length
        };

        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(JSON.stringify({
            error: error.message,
            url: url
        }));
        process.exit(1);
    }
}

main();
