/**
 * ClawGate Scheduler - Natural Language Schedule Parser
 * 
 * Converts human-readable schedule expressions to cron expressions.
 * Supports: "9am every Monday", "every 15 minutes", "next Tuesday at 3pm", "every day 4x"
 */

export interface ParseResult {
  cronExpression: string;
  description: string;
  maxRuns?: number;  // For "4x" syntax - auto-delete after N runs
  isOneTime?: boolean;  // For "in 5 minutes", "at 3pm today"
}

const DAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2, tues: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4, thurs: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseTime(timeStr: string): { hour: number; minute: number } {
  // Handle: 9, 9am, 9:30, 9:30am, 14:30, 2pm, 2:30pm
  const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) throw new Error(`Invalid time: ${timeStr}`);
  
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time: ${timeStr}`);
  }
  
  return { hour, minute };
}

function parseDay(dayStr: string): number {
  const day = DAYS[dayStr.toLowerCase()];
  if (day === undefined) throw new Error(`Invalid day: ${dayStr}`);
  return day;
}

function parseMonth(monthStr: string): number {
  const month = MONTHS[monthStr.toLowerCase()];
  if (month === undefined) throw new Error(`Invalid month: ${monthStr}`);
  return month;
}

// Normalize the input: lowercase, trim extra spaces
function normalize(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function parseSchedule(input: string): ParseResult {
  const normalized = normalize(input);
  
  // Try each pattern in order (most specific first)
  
  // Pattern: "every [N] minutes/hours/days/weeks/months"
  const intervalMatch = normalized.match(/^(?:every|each)\s+(\d+)?\s*(min|minute|minutes|hour|hours|day|days|week|weeks|month|months)$/);
  if (intervalMatch) {
    const value = intervalMatch[1] ? parseInt(intervalMatch[1], 10) : 1;
    const unit = intervalMatch[2];
    
    if (unit.startsWith('min')) {
      return { cronExpression: `*/${value} * * * *`, description: `Every ${value} minute${value > 1 ? 's' : ''}` };
    } else if (unit.startsWith('hour')) {
      return { cronExpression: `0 */${value} * * *`, description: `Every ${value} hour${value > 1 ? 's' : ''}` };
    } else if (unit.startsWith('day')) {
      return { cronExpression: `0 9 */${value} * *`, description: `Every ${value} day${value > 1 ? 's' : ''} at 9am` };
    } else if (unit.startsWith('week')) {
      return { cronExpression: `0 9 * * 1`, description: `Every ${value} week${value > 1 ? 's' : ''} on Monday at 9am` };
    } else if (unit.startsWith('month')) {
      return { cronExpression: `0 9 1 */${value} *`, description: `Every ${value} month${value > 1 ? 's' : ''} on the 1st at 9am` };
    }
  }
  
  // Pattern: "every [DAY] at [TIME]"
  const dayAtTimeMatch = normalized.match(/^every\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)\s+(?:at\s+)?([\d:]+(?:\s*[ap]m)?)$/);
  if (dayAtTimeMatch) {
    const day = parseDay(dayAtTimeMatch[1]);
    const time = parseTime(dayAtTimeMatch[2]);
    const dayName = Object.keys(DAYS).find(k => DAYS[k] === day && k.length > 3) || 'day';
    return { 
      cronExpression: `${time.minute} ${time.hour} * * ${day}`, 
      description: `Every ${dayName} at ${time.hour}:${time.minute.toString().padStart(2, '0')}` 
    };
  }
  
  // Pattern: "[TIME] every [DAY]"
  const timeEveryDayMatch = normalized.match(/^([\d:]+(?:\s*[ap]m)?)\s+every\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)$/);
  if (timeEveryDayMatch) {
    const time = parseTime(timeEveryDayMatch[1]);
    const day = parseDay(timeEveryDayMatch[2]);
    const dayName = Object.keys(DAYS).find(k => DAYS[k] === day && k.length > 3) || 'day';
    return { 
      cronExpression: `${time.minute} ${time.hour} * * ${day}`, 
      description: `${time.hour}:${time.minute.toString().padStart(2, '0')} every ${dayName}` 
    };
  }
  
  // Pattern: "every [DAY]" (default to 9am)
  const dayOnlyMatch = normalized.match(/^every\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)$/);
  if (dayOnlyMatch) {
    const day = parseDay(dayOnlyMatch[1]);
    const dayName = Object.keys(DAYS).find(k => DAYS[k] === day && k.length > 3) || 'day';
    return { 
      cronExpression: `0 9 * * ${day}`, 
      description: `Every ${dayName} at 9am` 
    };
  }
  
  // Pattern: "every [WEEKDAY|WEEKEND|DAY]"
  const specialDayMatch = normalized.match(/^every\s+(weekday|weekday|weekend)$/);
  if (specialDayMatch) {
    if (specialDayMatch[1] === 'weekday') {
      return { cronExpression: `0 9 * * 1-5`, description: `Every weekday (Mon-Fri) at 9am` };
    } else if (specialDayMatch[1] === 'weekend') {
      return { cronExpression: `0 9 * * 0,6`, description: `Every weekend (Sat-Sun) at 9am` };
    }
  }
  
  // Pattern: "everyday at [TIME]" or "daily at [TIME]"
  const dailyMatch = normalized.match(/^(?:everyday|daily)(?:\s+at\s+([\d:]+(?:\s*[ap]m)?))?$/);
  if (dailyMatch) {
    const time = dailyMatch[1] ? parseTime(dailyMatch[1]) : { hour: 9, minute: 0 };
    return { 
      cronExpression: `${time.minute} ${time.hour} * * *`, 
      description: `Daily at ${time.hour}:${time.minute.toString().padStart(2, '0')}` 
    };
  }
  
  // Pattern: "[TIME] everyday" or "[TIME] daily"
  const timeDailyMatch = normalized.match(/^([\d:]+(?:\s*[ap]m)?)\s+(?:everyday|daily)$/);
  if (timeDailyMatch) {
    const time = parseTime(timeDailyMatch[1]);
    return { 
      cronExpression: `${time.minute} ${time.hour} * * *`, 
      description: `${time.hour}:${time.minute.toString().padStart(2, '0')} daily` 
    };
  }
  
  // Pattern: "in [N] minutes/hours" (one-time)
  const inMatch = normalized.match(/^in\s+(\d+)\s*(min|minute|minutes|hour|hours)$/);
  if (inMatch) {
    const value = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const now = new Date();
    const target = new Date(now.getTime() + (unit.startsWith('min') ? value * 60000 : value * 3600000));
    return { 
      cronExpression: `${target.getMinutes()} ${target.getHours()} ${target.getDate()} ${target.getMonth() + 1} *`, 
      description: `At ${target.toISOString()}`,
      isOneTime: true 
    };
  }
  
  // Pattern: "at [TIME] today" (one-time)
  const todayMatch = normalized.match(/^at\s+([\d:]+(?:\s*[ap]m)?)\s+today$/);
  if (todayMatch) {
    const time = parseTime(todayMatch[1]);
    const now = new Date();
    return { 
      cronExpression: `${time.minute} ${time.hour} ${now.getDate()} ${now.getMonth() + 1} *`, 
      description: `Today at ${time.hour}:${time.minute.toString().padStart(2, '0')}`,
      isOneTime: true 
    };
  }
  
  // Pattern: "next [DAY] at [TIME]"
  const nextDayMatch = normalized.match(/^next\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)(?:\s+at\s+([\d:]+(?:\s*[ap]m)?))?$/);
  if (nextDayMatch) {
    const day = parseDay(nextDayMatch[1]);
    const time = nextDayMatch[2] ? parseTime(nextDayMatch[2]) : { hour: 9, minute: 0 };
    const now = new Date();
    const currentDay = now.getDay();
    const daysUntil = (day - currentDay + 7) % 7;
    const target = new Date(now);
    target.setDate(now.getDate() + (daysUntil === 0 ? 7 : daysUntil));
    const dayName = Object.keys(DAYS).find(k => DAYS[k] === day && k.length > 3) || 'day';
    return { 
      cronExpression: `${time.minute} ${time.hour} ${target.getDate()} ${target.getMonth() + 1} *`, 
      description: `Next ${dayName} at ${time.hour}:${time.minute.toString().padStart(2, '0')}`,
      isOneTime: true 
    };
  }
  
  // Pattern: "on the [N]th of [MONTH] at [TIME]"
  const monthDayMatch = normalized.match(/^on\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(\w+)(?:\s+at\s+([\d:]+(?:\s*[ap]m)?))?$/);
  if (monthDayMatch) {
    const day = parseInt(monthDayMatch[1], 10);
    const month = parseMonth(monthDayMatch[2]);
    const time = monthDayMatch[3] ? parseTime(monthDayMatch[3]) : { hour: 9, minute: 0 };
    return { 
      cronExpression: `${time.minute} ${time.hour} ${day} ${month} *`, 
      description: `${time.hour}:${time.minute.toString().padStart(2, '0')} on the ${day}th of ${Object.keys(MONTHS).find(k => MONTHS[k] === month && k.length > 3)}` 
    };
  }
  
  // Pattern: "at [am|pm]" shorthand (e.g., "at 9am", "at 2pm")
  const ampmMatch = normalized.match(/^at\s+(\d{1,2})(am|pm)$/);
  if (ampmMatch) {
    const hour = parseInt(ampmMatch[1], 10);
    const isPm = ampmMatch[2] === 'pm';
    const finalHour = isPm ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    return { 
      cronExpression: `0 ${finalHour} * * *`, 
      description: `Daily at ${hour}${ampmMatch[2]}` 
    };
  }
  
  // Pattern: "[N]am" or "[N]pm" shorthand (e.g., "9am", "2pm")
  const simpleTimeMatch = normalized.match(/^(\d{1,2})(am|pm)$/);
  if (simpleTimeMatch) {
    const hour = parseInt(simpleTimeMatch[1], 10);
    const isPm = simpleTimeMatch[2] === 'pm';
    const finalHour = isPm ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    return { 
      cronExpression: `0 ${finalHour} * * *`, 
      description: `Daily at ${hour}${simpleTimeMatch[2]}` 
    };
  }
  
  // Check for count suffix: "... [N]x" or "... [N] times"
  const countMatch = input.match(/(\d+)\s*(?:x|times?)\s*$/i);
  const maxRuns = countMatch ? parseInt(countMatch[1], 10) : undefined;
  
  if (maxRuns) {
    // Strip the count from input and re-parse
    const baseInput = input.replace(/\s*\d+\s*(?:x|times?)\s*$/i, '').trim();
    const baseResult = parseSchedule(baseInput);
    return { ...baseResult, maxRuns };
  }
  
  // Raw cron fallback: "0 9 * * 1" or "*/15 * * * *"
  const cronMatch = input.match(/^([\d*\/,-]+)\s+([\d*\/,-]+)\s+([\d*\/,-]+)\s+([\d*\/,-]+)\s+([\d*\/,-]+)$/);
  if (cronMatch) {
    return { 
      cronExpression: `${cronMatch[1]} ${cronMatch[2]} ${cronMatch[3]} ${cronMatch[4]} ${cronMatch[5]}`, 
      description: `Custom schedule: ${input}` 
    };
  }
  
  throw new Error(`Could not parse schedule: "${input}". Try: "9am every Monday", "every 15 minutes", "next Tuesday", "daily at 5pm"`);
}

// Helper to suggest similar patterns when parsing fails
export function getScheduleExamples(): string[] {
  return [
    '9am every Monday',
    'every Tuesday at 3pm',
    'every 15 minutes',
    'every hour',
    'daily at 9am',
    'weekdays at 8:30am',
    'next Thursday',
    'in 30 minutes',
    'at 2pm today',
    '1st of January at midnight',
    'every day 4x',  // 4 times then auto-delete
    '*/5 * * * *',  // raw cron
  ];
}
