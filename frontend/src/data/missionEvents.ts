/**
 * Dated mission events. Every entry is taken from the sources in docs/VALIDATION.md and carries its link.
 * Nothing here is estimated or filled in: if a source does not give an event, it is not listed.
 */
export type MissionEvent = {
  siteId: string;
  /** ISO UTC time. `approximate` is true when sources give the time only to within minutes. */
  time: string;
  approximate: boolean;
  label: string;
  source: { name: string; url: string };
};
export type MissionFacts = {
  siteId: string; provider: string; designation: string; outcome: string;
  sources: { name: string; url: string }[];
};

export const missionFacts: MissionFacts[] = [
  {
    siteId: "odysseus-im1", provider: "Intuitive Machines", designation: "IM-1",
    outcome: "Landed on its side in a small crater; went dormant on 29 Feb 2024 as lunar night approached.",
    sources: [
      { name: "LROC (position)", url: "https://www.lroc.asu.edu/images/1360" },
      { name: "Universe Today", url: "https://www.universetoday.com/articles/lunar-night-permanently-ends-the-odysseus-mission" },
    ],
  },
  {
    siteId: "athena-im2", provider: "Intuitive Machines", designation: "IM-2",
    outcome: "Landed on its side in a crater about 20 m across; mission ended about 12 h 45 min after landing, against 10 days planned.",
    sources: [
      { name: "LROC (position)", url: "https://lroc.im-ldi.com/images/1408" },
      { name: "SpacePolicyOnline", url: "https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/" },
    ],
  },
];

export const missionEvents: MissionEvent[] = [
  { siteId: "odysseus-im1", time: "2024-02-22T23:23:00Z", approximate: true, label: "Odysseus (IM-1) lands (about 80.13° S, 1.44° E)",
    source: { name: "AP via PBS NewsHour", url: "https://www.pbs.org/newshour/amp/science/private-u-s-lunar-lander-to-cease-operations-tuesday-after-landing-sideways" } },
  { siteId: "odysseus-im1", time: "2024-02-29", approximate: true, label: "Odysseus goes dormant; final image received that day (time of day not given)",
    source: { name: "Reuters via BusinessDay", url: "https://www.businessday.co.za/bd/world/2024-03-01-us-moon-lander-odysseus-goes-dark-a-week-after-hard-soft-landing/" } },
  { siteId: "athena-im2", time: "2025-03-06T17:30:00Z", approximate: true, label: "Athena (IM-2) lands; sources differ by a few minutes",
    source: { name: "Spaceflight Now", url: "https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/" } },
  { siteId: "athena-im2", time: "2025-03-07T06:15:00Z", approximate: true, label: "Athena mission ends",
    source: { name: "SpacePolicyOnline", url: "https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/" } },
].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
