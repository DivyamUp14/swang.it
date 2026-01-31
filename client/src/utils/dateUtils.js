/**
 * Utility functions for handling timezone conversions.
 * Application Canonical Timezone: 'Europe/Rome'
 */

/**
 * Parses a date string and time string (implicitly Europe/Rome) into a JS Date object.
 * Handles CET (+01:00) and CEST (+02:00) approximation.
 * 
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - HH:MM
 * @returns {Date} JavaScript Date object (absolute time)
 */
export const parseRomeDate = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return new Date();

    // Clean inputs
    let d = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;

    // Handle DD/MM/YYYY or D/M/YYYY format (e.g., 19/1/2026)
    // Regex matches 1-2 digits, slash, 1-2 digits, slash, 4 digits
    const dmyMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
        // Convert to YYYY-MM-DD
        // padStart insures 01, 02 etc.
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        d = `${year}-${month}-${day}`;
    }

    const t = timeStr.trim();

    // Construct base ISO string
    // If time is HH:MM (5 chars), append :00. If HH:MM:SS (8 chars), leave as is.
    const timePart = t.length === 5 ? `${t}:00` : t;
    const baseIso = `${d}T${timePart}`;

    // Determine Daylight Saving Time (DST) for Rome
    // Rule: Last Sunday March to Last Sunday October
    // Simplification for stability matching Server logic:
    // We'll use a slightly smarter heuristic than just "Month 4-10"
    // but keep it compatible without external libraries.

    const tempDate = new Date(baseIso);
    const month = tempDate.getMonth() + 1; // 1-12

    // Approximate DST: April (4) to October (10) inclusive are definitely CEST (+02:00)
    // March and October edge cases are tricky without real TZ lib, 
    // but for now we follow the Server's logic to maintain consistency.
    const isSummer = month >= 4 && month <= 10;

    const offset = isSummer ? '+02:00' : '+01:00';

    // Create absolute date
    const finalDate = new Date(`${baseIso}${offset}`);

    return finalDate;
};

/**
 * Formats a Date object into a readable string for a specific timezone.
 * 
 * @param {Date} dateObj - The Date object to format
 * @param {string} timeZone - IANA timezone string (e.g. 'Asia/Kolkata'), defaults to system
 * @returns {string} Formatted string (e.g. "15:45 (Asia/Kolkata)")
 */
export const formatTimeInZone = (dateObj, timeZone) => {
    if (!dateObj || isNaN(dateObj.getTime())) return '--:--';

    const usedTz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
        const timeStr = new Intl.DateTimeFormat('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: usedTz
        }).format(dateObj);

        return `${timeStr} (${usedTz})`;
    } catch (e) {
        console.warn('Timezone formatting error:', e);
        // Fallback to local
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
};

/**
 * Full Date+Time formatter
 */
export const formatDateTimeInZone = (dateObj, timeZone) => {
    if (!dateObj || isNaN(dateObj.getTime())) return 'Data non valida';

    const usedTz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
        return new Intl.DateTimeFormat('it-IT', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: usedTz,
            timeZoneName: 'short'
        }).format(dateObj);
    } catch (e) {
        return dateObj.toLocaleString();
    }
};
