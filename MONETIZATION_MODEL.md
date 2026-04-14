# Anchor Voice - Monetization Model

**Core Philosophy:** Unlimited connections free (accessibility first). Monetize on intelligence & organization tools.

---

## Pricing Tiers

### Free Tier
- **Unlimited 1:1 connections** (therapist, support worker, family, friends - as many as needed)
- **Unlimited voice messages**
- **Basic tone analysis** (raised voice, fast pacing, emotional charge)
- **3 de-escalation suggestions per message**
- **Basic AI suggestions** (Claude 3 Haiku or similar)
- **Privacy-first** (no data storage)

**Who:** Anyone wanting de-escalation support without payment  
**Why free:** Removes barriers for disabled/vulnerable populations

---

### Pro Individual - $4.99/month
- Everything in Free, PLUS:
- **Advanced AI suggestions** (Claude 3.5 Sonnet - smarter, more personalized)
- **5 suggestions per message** (vs 3)
- **Pattern insights** (aggregated stats without storing conversations)
  - "You tend to escalate when stressed"
  - "Your tone improves after breaks"
  - "Common trigger words for you"
- **Custom response templates** (save styles & preferences)
- **Session export** (generate safe PDF summary, then user deletes)
- **Offline mode** (record & store locally until reconnect)
- **Priority support**

**Target:** Individuals wanting smarter assistance + self-awareness  
**Why upgrade:** Better AI = better suggestions = better de-escalation outcomes

---

### Pro Organization - $49/month per support worker
For therapists, counselors, support workers managing multiple clients

- Everything in Free & Pro Individual, PLUS:
- **Client dashboard** (see tone patterns across all your clients)
  - Which clients escalate most
  - Common triggers by client
  - Progress tracking (tone improving over time?)
- **Team management** (multiple workers, shared clients)
- **Supervision reports** (aggregated insights for your supervisor/manager)
- **API access** (integrate with existing support systems)
- **Bulk messaging** (send tips/resources to multiple clients)
- **Priority support + training**

**Target:** Mental health orgs, disability support services, counseling centers  
**Why upgrade:** Manage clients at scale, evidence-based supervision

---

## Revenue Model

| Tier | Monthly | Annual | Target Users |
|------|---------|--------|--------------|
| Free | $0 | $0 | 10,000+ (mass market) |
| Pro Individual | $4.99 | $49.99 | 500-1,000 (5-10% conversion) |
| Pro Organization | $49 | $490 | 50-100 (enterprise) |

**Year 1 Revenue Projection:**
- 10,000 free users → 750 Pro Individual @ $4.99 = $3,735/mo
- 50 Pro Organization @ $49 = $2,450/mo
- **~$74,000/year** (+ API revenue TBD)

---

## Why This Works for Anchor's Mission

✅ **Accessibility first** - Free tier removes all barriers for disabled people  
✅ **Privacy maintained** - No data storage, even for paid users  
✅ **Scales with user** - Free for individuals, org pricing for teams  
✅ **Real value** - Upgrade for smarter AI, not fake limits  
✅ **Trust building** - Generous free tier = loyal users who upgrade  

---

## Implementation Timeline

**Phase 1 (Now - Beta):**
- [ ] Launch free tier only
- [ ] Collect feedback on AI quality & suggestions
- [ ] Test pattern analytics (aggregated, no storage)

**Phase 2 (Post-Beta, Month 1):**
- [ ] Add Pro Individual features
- [ ] Launch with 30-day free trial for Pro
- [ ] Collect org interest

**Phase 3 (Month 2+):**
- [ ] Launch Pro Organization
- [ ] Partner with disability support orgs
- [ ] Add API access for integrations

---

## Technical Requirements

**For Pro Individual:**
- ✅ Better AI model (Claude 3.5 Sonnet)
- ✅ Pattern aggregation (stats without storing messages)
- ✅ Custom template storage (local user data)
- ✅ PDF export (generated on-demand)
- ✅ Offline recording (local storage)

**For Pro Organization:**
- ✅ Worker login / client dashboard
- ✅ Aggregated stats endpoint (tone trends, triggers)
- ✅ Team management (assign clients to workers)
- ✅ Reports generation (PDF snapshots)
- ✅ API documentation

**No new data storage required** - all patterns computed real-time or user-local

---

## Subscription Implementation

Use **RevenueCat** or **Lemonsqueezy**:
- Handles Apple/Google billing
- Subscription management
- Free trial logic
- Stripe backup for web

Simple API call in app:
```typescript
if (hasActiveSubscription('anchor_pro')) {
  // Show Pro features
}
```

---

## Messaging for Testers

During beta, emphasize:
- "We're testing with free tier for all testers"
- "Paid tiers coming post-beta for power users & organizations"
- "Your privacy is protected - we'll never store conversations"
- "Upgrade only if you want smarter AI + insights"

