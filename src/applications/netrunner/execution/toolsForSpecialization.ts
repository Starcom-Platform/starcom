/**
 * Which tools a bot's mission runs, by the bot's specialization.
 *
 * One list, read by the mission executor to choose tools and by the Create Bot
 * dialog to say what a mission will run, so the dialog cannot promise a tool the
 * executor does not select.
 *
 * Names, not ids: they are matched against each registered adapter's
 * getToolSchema().name, because the tool catalog generates the ids for Shodan,
 * theHarvester, Censys and VirusTotal afresh on every load. They must match
 * EXACTLY: 'Intel Analyzer' (with the space) is IntelAnalyzerAdapter's name;
 * 'IntelAnalyzer' once matched nothing, so that tool was never selected for any bot.
 */
import type { IntelType } from '../tools/NetRunnerPowerTools';

const TOOLS_FOR_SPECIALIZATION: Record<IntelType, string[]> = {
  network: ['Shodan', 'theHarvester', 'Intel Analyzer'],
  social: ['theHarvester', 'Intel Analyzer'],
  vulnerability: ['Shodan', 'Intel Analyzer'],
  threat: ['Shodan', 'Intel Analyzer'],
  identity: ['theHarvester', 'Intel Analyzer'],
  financial: ['Intel Analyzer'],
  infrastructure: ['Shodan', 'theHarvester', 'Intel Analyzer'],
  geospatial: ['Intel Analyzer'],
  temporal: ['Intel Analyzer'],
  darkweb: ['Intel Analyzer'],
};

/** The tool names a mission for this specialization asks for, in order. */
export function toolNamesFor(specialization: IntelType): string[] {
  return TOOLS_FOR_SPECIALIZATION[specialization] ?? ['Intel Analyzer'];
}

/** The specializations whose missions ask for this tool. */
export function specializationsUsing(toolName: string): IntelType[] {
  return (Object.keys(TOOLS_FOR_SPECIALIZATION) as IntelType[])
    .filter((specialization) => TOOLS_FOR_SPECIALIZATION[specialization].includes(toolName));
}
