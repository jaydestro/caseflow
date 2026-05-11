import { v4 as uuid } from 'uuid';
import { Repositories } from '../data/repositories';
import { getRepositories } from '../data';
import { logger } from '../lib/logger';
import {
  Agent,
  CaseComment,
  CasePriority,
  CaseStatus,
  Customer,
  StatusEvent,
  SupportCase,
  Tenant,
} from '../models/entities';

const ts = (d: Date = new Date()) => d.toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

const TENANTS: Array<Pick<Tenant, 'id' | 'name' | 'plan'>> = [
  { id: 'tenant-northwind', name: 'Northwind Traders', plan: 'growth' },
  { id: 'tenant-contoso', name: 'Contoso Ltd.', plan: 'enterprise' },
  { id: 'tenant-fabrikam', name: 'Fabrikam Inc.', plan: 'starter' },
];

const AGENTS: Record<string, Array<{ name: string; email: string; role: Agent['role'] }>> = {
  'tenant-northwind': [
    { name: 'Priya Patel', email: 'priya@northwind.example', role: 'lead' },
    { name: 'Marcus Lee', email: 'marcus@northwind.example', role: 'agent' },
    { name: 'Ana Costa', email: 'ana@northwind.example', role: 'agent' },
    { name: 'Tomás Herrera', email: 'tomas@northwind.example', role: 'agent' },
  ],
  'tenant-contoso': [
    { name: 'Yuki Tanaka', email: 'yuki@contoso.example', role: 'lead' },
    { name: 'Diego Rivera', email: 'diego@contoso.example', role: 'agent' },
    { name: 'Sasha Volkov', email: 'sasha@contoso.example', role: 'admin' },
    { name: 'Mei Chen', email: 'mei@contoso.example', role: 'agent' },
    { name: 'Owen Walsh', email: 'owen@contoso.example', role: 'agent' },
  ],
  'tenant-fabrikam': [
    { name: 'Elena Marsh', email: 'elena@fabrikam.example', role: 'lead' },
    { name: 'Jordan Kim', email: 'jordan@fabrikam.example', role: 'agent' },
    { name: 'Rafael Souza', email: 'rafael@fabrikam.example', role: 'agent' },
  ],
};

const CUSTOMERS: Record<string, Array<{ name: string; email: string; company: string }>> = {
  'tenant-northwind': [
    { name: 'Dana Whitcomb', email: 'dana@acme.example', company: 'Acme Logistics' },
    { name: 'Henrik Olsen', email: 'henrik@blueriver.example', company: 'BlueRiver Foods' },
    { name: 'Sarah Iverson', email: 'sarah@harvestcoop.example', company: 'Harvest Coop' },
    { name: 'Lin Zhao', email: 'lin@meridianship.example', company: 'Meridian Shipping' },
    { name: "Patrick O'Connell", email: 'patrick@grovetech.example', company: 'GroveTech' },
  ],
  'tenant-contoso': [
    { name: 'Jamie Reston', email: 'jamie@pinewood.example', company: 'Pinewood Studios' },
    { name: 'Brenda Carrington', email: 'brenda@lakesidebank.example', company: 'Lakeside Bank' },
    { name: 'Alex Petrov', email: 'alex@coreoptics.example', company: 'CoreOptics' },
    { name: 'Mira Shah', email: 'mira@northstarinsurance.example', company: 'Northstar Insurance' },
    { name: 'Daniel Greer', email: 'daniel@halcyonmedia.example', company: 'Halcyon Media' },
    { name: 'Kasi Brooks', email: 'kasi@vertexpartners.example', company: 'Vertex Partners' },
  ],
  'tenant-fabrikam': [
    { name: 'Ravi Singh', email: 'ravi@atlasrobotics.example', company: 'Atlas Robotics' },
    { name: 'Camille Boucher', email: 'camille@orchardhealth.example', company: 'Orchard Health' },
    { name: 'Theo Nakamura', email: 'theo@birchlabs.example', company: 'Birch Labs' },
    { name: 'Nadia El-Sayed', email: 'nadia@summitfoundry.example', company: 'Summit Foundry' },
  ],
};

interface CaseTemplate {
  subject: string;
  description: string;
  priority: CasePriority;
  status: CaseStatus;
  ageHours: number;
  comments: Array<{ kind: 'agent' | 'customer'; body: string; minsAfter: number }>;
}

const CASE_TEMPLATES: CaseTemplate[] = [
  {
    subject: 'API returning 500 on POST /orders for the last 20 minutes',
    description:
      'We started seeing intermittent 500 responses from POST /v1/orders around 14:05 UTC. Roughly 1 in 4 requests fail. Order ids that failed: ord_9183, ord_9184, ord_9192. No code changes on our side today.',
    priority: 'urgent',
    status: 'open',
    ageHours: 1,
    comments: [
      { kind: 'agent', minsAfter: 6, body: 'Thanks for the trace ids — pulled them up, all three hit api-prod-east-3. Investigating now, will keep you posted.' },
      { kind: 'customer', minsAfter: 22, body: 'The failure rate seems to have climbed to ~40%. We may have to fail over to the staging endpoint if this continues.' },
    ],
  },
  {
    subject: 'SSO login loop after switching IdP from Okta to Entra',
    description:
      'We migrated our IdP from Okta to Entra ID over the weekend. Users now hit a redirect loop on /sso/callback after entering credentials. Affects ~80 users.',
    priority: 'high',
    status: 'pending',
    ageHours: 6,
    comments: [
      { kind: 'agent', minsAfter: 12, body: 'Looks like the audience claim in the SAML response is set to the old Okta entityID. Can you confirm the value configured under SP entity ID on the Entra side?' },
      { kind: 'customer', minsAfter: 95, body: 'Confirmed — it was still set to the Okta value. Updated to https://app.caseflow.example/saml/metadata. Testing now.' },
      { kind: 'agent', minsAfter: 110, body: 'Cleared our SP-side cached metadata so the next login should pick up the new value. Marking pending while you verify.' },
    ],
  },
  {
    subject: 'Webhook deliveries delayed by 5–10 minutes',
    description:
      'Our billing system relies on the invoice.paid webhook. Since yesterday afternoon delivery latency has been 5–10 minutes instead of sub-second. Receiving endpoint is healthy and returning 200s.',
    priority: 'high',
    status: 'open',
    ageHours: 18,
    comments: [
      { kind: 'agent', minsAfter: 30, body: 'Confirmed elevated lag in our webhook delivery queue for tenants in the EU region. Engineering is draining the backlog now.' },
    ],
  },
  {
    subject: 'Bulk CSV export missing rows for large date ranges',
    description:
      'A 90-day contacts export returns ~12,400 rows; the same export run a day earlier returned ~14,800. Nothing was deleted. 7-day exports look complete.',
    priority: 'normal',
    status: 'pending',
    ageHours: 28,
    comments: [
      { kind: 'agent', minsAfter: 45, body: 'Could you grab the export job id from the Exports page (top right of the row)? It will start with exp_.' },
      { kind: 'customer', minsAfter: 320, body: 'Job id is exp_4c81a9. Ran a fresh export this morning, same gap.' },
    ],
  },
  {
    subject: 'Two-factor reset email never arrives',
    description:
      'Locked out of admin account; password reset and 2FA reset emails do not arrive. Allow-listed @caseflow.example. Other notifications do arrive.',
    priority: 'high',
    status: 'resolved',
    ageHours: 30,
    comments: [
      { kind: 'agent', minsAfter: 8, body: 'Outbound log shows the messages bounced — your mail provider rejected them as spam. I have manually reset 2FA on my side. You should be able to log in and re-enroll.' },
      { kind: 'customer', minsAfter: 25, body: 'In, thanks. Re-enrolled with the authenticator app this time.' },
      { kind: 'agent', minsAfter: 27, body: 'Glad to hear it. Closing this out — please reopen if anything else comes up.' },
    ],
  },
  {
    subject: 'Dashboard charts not loading in Safari 17',
    description:
      'Several analysts use Safari on macOS Sonoma. Revenue and pipeline charts on the main dashboard render as empty containers. Same dashboards load fine in Chrome and Firefox.',
    priority: 'normal',
    status: 'pending',
    ageHours: 40,
    comments: [
      { kind: 'agent', minsAfter: 60, body: 'Reproduced in Safari 17.3. Looks like the charting library has a known regression with that version. Testing a workaround.' },
    ],
  },
  {
    subject: 'Custom report exceeds 30-second timeout',
    description:
      'The weekly executive rollup report has been timing out for the last two runs. Pulls ~6 months of activity across all teams. Worked fine until ~2 weeks ago.',
    priority: 'normal',
    status: 'open',
    ageHours: 50,
    comments: [
      { kind: 'agent', minsAfter: 25, body: 'Slow query log shows a full scan because of how the date filter interacts with one of the new computed fields. Working on an index hint.' },
    ],
  },
  {
    subject: 'Billing invoice shows wrong line item',
    description:
      'Invoice INV-20260415-0042 lists "Premium SLA add-on" which we have never purchased. Could you check the billing history?',
    priority: 'normal',
    status: 'resolved',
    ageHours: 72,
    comments: [
      { kind: 'agent', minsAfter: 40, body: 'You are right — the line item was added by mistake during a billing migration on 04/14. Issued a corrected invoice and credited the difference.' },
      { kind: 'customer', minsAfter: 90, body: 'Corrected invoice received, thank you.' },
    ],
  },
  {
    subject: 'Mobile app crashes on launch (Android 14)',
    description:
      'Reps got the latest Play Store update this morning and the app crashes immediately on launch. Affects all Pixel and Samsung devices on Android 14. Older devices fine.',
    priority: 'urgent',
    status: 'pending',
    ageHours: 4,
    comments: [
      { kind: 'agent', minsAfter: 18, body: 'Confirmed via crashlytics — null pointer on first-run analytics init. Hotfix build 4.12.1 is rolling out, ETA 30 min for full Play rollout.' },
    ],
  },
  {
    subject: 'Rate limit on /search seems too aggressive',
    description:
      'Our integration polls /search at ~5 req/sec across the account and is hitting 429s now. Docs say the limit is 10 req/sec per token. Token id: tk_live_a1b2.',
    priority: 'low',
    status: 'open',
    ageHours: 8,
    comments: [
      { kind: 'agent', minsAfter: 70, body: 'Limit on that token is set to 5/sec — looks like it was lowered during a noisy-neighbor incident last month and never reset. Restoring to 10/sec.' },
    ],
  },
  {
    subject: 'Need help configuring SAML attributes for role mapping',
    description:
      'We want to map IdP group memberships to roles in CaseFlow. What attribute names should we send and how does matching work for nested groups?',
    priority: 'low',
    status: 'pending',
    ageHours: 96,
    comments: [
      { kind: 'agent', minsAfter: 240, body: 'Sent over our SAML attribute mapping doc. tl;dr — send a multi-value `groups` claim, exact-match against role names you configure under Settings → Roles.' },
    ],
  },
  {
    subject: 'Cannot log into the admin portal — "organization disabled"',
    description:
      'Admin URL shows "This organization has been disabled." Billing is up to date. Other team members see the same.',
    priority: 'urgent',
    status: 'resolved',
    ageHours: 26,
    comments: [
      { kind: 'agent', minsAfter: 5, body: 'Apologies — a payment-method update job flagged your org incorrectly. Re-enabled. You should be able to sign in now.' },
      { kind: 'customer', minsAfter: 12, body: 'Back in, thanks for the quick fix.' },
    ],
  },
  {
    subject: 'Webhook signature verification failing after key rotation',
    description:
      'We rotated our webhook signing secret yesterday. Since then the signature header does not verify on our side. Using the v1 scheme as documented.',
    priority: 'high',
    status: 'closed',
    ageHours: 144,
    comments: [
      { kind: 'agent', minsAfter: 20, body: 'Two active secrets exist during a rotation grace window. You will receive both signatures comma-separated in the header — accept the request if either matches.' },
      { kind: 'customer', minsAfter: 60, body: 'Got it, updated our middleware to try both. Working now.' },
      { kind: 'agent', minsAfter: 65, body: 'Closing this one out.' },
    ],
  },
  {
    subject: 'Search returns stale results for newly created records',
    description:
      'Records created via the API show up in list endpoints immediately but take 2–3 minutes to appear in /search. Customer-facing dashboard relies on /search.',
    priority: 'normal',
    status: 'open',
    ageHours: 12,
    comments: [],
  },
];

const NOISE_SUBJECTS = [
  'Quick question about API key scopes',
  'Feature request: bulk re-assign cases',
  'How do I change my notification preferences?',
  'Audit log retention question',
  'Trouble inviting a teammate',
  'Sandbox environment access',
];

function pick<T>(arr: T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

export async function runSeed(repos: Repositories): Promise<void> {
  let total = 0;

  for (const t of TENANTS) {
    const tenant: Tenant = {
      id: t.id,
      type: 'tenant',
      tenantId: t.id,
      name: t.name,
      plan: t.plan,
      createdAt: ts(daysAgo(180)),
      updatedAt: ts(daysAgo(180)),
    };
    await repos.upsertAny(tenant);
    total++;

    const agents: Agent[] = (AGENTS[t.id] ?? []).map((a, i) => ({
      id: uuid(),
      type: 'agent',
      tenantId: t.id,
      name: a.name,
      email: a.email,
      role: a.role,
      createdAt: ts(daysAgo(150 - i)),
      updatedAt: ts(daysAgo(150 - i)),
    }));
    for (const a of agents) await repos.upsertAny(a);
    total += agents.length;

    const customers: Customer[] = (CUSTOMERS[t.id] ?? []).map((c, i) => ({
      id: uuid(),
      type: 'customer',
      tenantId: t.id,
      name: c.name,
      email: c.email,
      company: c.company,
      createdAt: ts(daysAgo(120 - i * 3)),
      updatedAt: ts(daysAgo(120 - i * 3)),
    }));
    for (const c of customers) await repos.upsertAny(c);
    total += customers.length;

    const offset = t.id.length;
    for (let i = 0; i < CASE_TEMPLATES.length; i++) {
      const tpl = CASE_TEMPLATES[i];
      const id = uuid();
      const opened = hoursAgo(tpl.ageHours);
      const customer = pick(customers, i + offset);
      const agent = pick(agents, i + offset);

      const transitions: Array<{ from: CaseStatus | null; to: CaseStatus; at: Date }> = [
        { from: null, to: 'open', at: opened },
      ];
      if (tpl.status === 'pending' || tpl.status === 'resolved' || tpl.status === 'closed') {
        transitions.push({
          from: 'open',
          to: 'pending',
          at: new Date(opened.getTime() + 15 * 60_000),
        });
      }
      if (tpl.status === 'resolved' || tpl.status === 'closed') {
        transitions.push({
          from: 'pending',
          to: 'resolved',
          at: new Date(opened.getTime() + tpl.ageHours * 0.7 * 3_600_000),
        });
      }
      if (tpl.status === 'closed') {
        transitions.push({
          from: 'resolved',
          to: 'closed',
          at: new Date(opened.getTime() + tpl.ageHours * 0.9 * 3_600_000),
        });
      }

      const lastEvent = transitions[transitions.length - 1].at;
      const lastCommentTime = tpl.comments.length
        ? new Date(opened.getTime() + tpl.comments[tpl.comments.length - 1].minsAfter * 60_000)
        : opened;
      const updated = new Date(Math.max(lastEvent.getTime(), lastCommentTime.getTime()));

      const c: SupportCase = {
        id,
        type: 'case',
        tenantId: t.id,
        subject: tpl.subject,
        description: tpl.description,
        status: tpl.status,
        priority: tpl.priority,
        customerId: customer.id,
        assignedAgentId: agent.id,
        createdAt: ts(opened),
        updatedAt: ts(updated),
      };
      await repos.upsertCase(c);
      total++;

      for (const tr of transitions) {
        const ev: StatusEvent = {
          id: uuid(),
          type: 'statusEvent',
          tenantId: t.id,
          caseId: id,
          fromStatus: tr.from,
          toStatus: tr.to,
          changedBy: agent.id,
          note: tr.from === null ? undefined : `Moved to ${tr.to}.`,
          createdAt: ts(tr.at),
          updatedAt: ts(tr.at),
        };
        await repos.upsertStatusEvent(ev);
        total++;
      }

      for (const cm of tpl.comments) {
        const at = new Date(opened.getTime() + cm.minsAfter * 60_000);
        const author = cm.kind === 'agent' ? agent.id : customer.id;
        const comment: CaseComment = {
          id: uuid(),
          type: 'comment',
          tenantId: t.id,
          caseId: id,
          authorId: author,
          authorKind: cm.kind,
          body: cm.body,
          createdAt: ts(at),
          updatedAt: ts(at),
        };
        await repos.upsertComment(comment);
        total++;
      }
    }

    // Background-noise closed cases so the dashboard isn't sparse when
    // the user filters by closed.
    for (let i = 0; i < 6; i++) {
      const opened = daysAgo(8 + i * 2);
      const closed = new Date(opened.getTime() + 6 * 3_600_000);
      const id = uuid();
      const customer = pick(customers, i + 1);
      const agent = pick(agents, i + 2);
      const c: SupportCase = {
        id,
        type: 'case',
        tenantId: t.id,
        subject: pick(NOISE_SUBJECTS, i),
        description: 'Resolved via documentation link.',
        status: 'closed',
        priority: 'low',
        customerId: customer.id,
        assignedAgentId: agent.id,
        createdAt: ts(opened),
        updatedAt: ts(closed),
      };
      await repos.upsertCase(c);
      total++;

      const trail: Array<[CaseStatus | null, CaseStatus, Date]> = [
        [null, 'open', opened],
        ['open', 'resolved', new Date(opened.getTime() + 2 * 3_600_000)],
        ['resolved', 'closed', closed],
      ];
      for (const [from, to, when] of trail) {
        await repos.upsertStatusEvent({
          id: uuid(),
          type: 'statusEvent',
          tenantId: t.id,
          caseId: id,
          fromStatus: from,
          toStatus: to,
          changedBy: agent.id,
          createdAt: ts(when),
          updatedAt: ts(when),
        });
        total++;
      }
    }

    // Historical bulk: closed cases over the last ~6 months. Models the
    // reality of a tenant that's been on the platform for a while — the
    // active dashboard view is small but the underlying container has
    // thousands of docs that every cross-partition query has to scan.
    // Northwind and Contoso are "growing" tenants; Fabrikam is smaller.
    const bulkCount =
      t.id === 'tenant-contoso' ? 900 : t.id === 'tenant-northwind' ? 600 : 200;
    for (let i = 0; i < bulkCount; i++) {
      const opened = daysAgo(7 + (i % 170));
      const closed = new Date(opened.getTime() + (2 + (i % 20)) * 3_600_000);
      const id = uuid();
      const customer = pick(customers, i);
      const agent = pick(agents, i);
      await repos.upsertCase({
        id,
        type: 'case',
        tenantId: t.id,
        subject: pick(NOISE_SUBJECTS, i) + ` #${i + 1}`,
        description: 'Resolved via documentation link.',
        status: 'closed',
        priority: i % 17 === 0 ? 'high' : 'low',
        customerId: customer.id,
        assignedAgentId: agent.id,
        createdAt: ts(opened),
        updatedAt: ts(closed),
      });
      total++;
      await repos.upsertStatusEvent({
        id: uuid(),
        type: 'statusEvent',
        tenantId: t.id,
        caseId: id,
        fromStatus: null,
        toStatus: 'open',
        changedBy: agent.id,
        createdAt: ts(opened),
        updatedAt: ts(opened),
      });
      total++;
      await repos.upsertStatusEvent({
        id: uuid(),
        type: 'statusEvent',
        tenantId: t.id,
        caseId: id,
        fromStatus: 'open',
        toStatus: 'closed',
        changedBy: agent.id,
        createdAt: ts(closed),
        updatedAt: ts(closed),
      });
      total += 1;
    }
  }

  logger.info({ total }, 'seed complete');
}

export async function runSeedIfEmpty(repos: Repositories): Promise<void> {
  const tenants = await repos.listTenants();
  if (tenants.length === 0) {
    logger.info('no data found, seeding sample dataset');
    await runSeed(repos);
  }
}

if (require.main === module) {
  (async () => {
    const repos = await getRepositories();
    await runSeed(repos);
  })().catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  });
}
