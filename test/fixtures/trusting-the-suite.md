---
title: Trusting the Test Suite
evidence: flaky-test-notes.md
sources: internal retro notes &amp; the build history for Q2
---

eyebrow: ENGINEERING PRACTICE · WALKING DECK

# A green suite nobody believes is worse than a red one.
How a test suite loses trust, what that costs, and the order to fix it in.

- Audience: engineers who have started re-running CI "to see if it passes"
- Format: team walkthrough, roughly 40 minutes

---

eyebrow: THE REFRAME
numbered: true

## A flaky test is a broken test that lies
The failure isn't the intermittency. It's that the suite has started producing a signal people route around, and routing around a signal is a habit that generalises.

### If it fails sometimes
It fails. Intermittency is a property of the bug, not a lesser category of bug.

### If you re-run it
You have decided the result is noise. Write that decision down, because right now it lives only in your head.

### If you re-run it twice {accent}
The suite is no longer a gate. It is a formality with a latency cost.

> **The tell is behavioural, not statistical.** You do not need a flake-rate dashboard to know you have a problem. You need to notice the first time someone says "just hit retry" and nobody argues.

---

eyebrow: WHAT IT COSTS

## What each piece is really for
A suite does four separate jobs, and flakiness damages them in a specific order.

| The job | What it gives you | What flakiness takes first |
|---|---|---|
| **Gate** | Nothing broken merges | Gone immediately &mdash; a gate you bypass is not a gate |
| **Alarm** | You hear about a regression fast | Degrades &middot; real failures hide among known-bad tests |
| **Documentation** | The test says what the code promises | Survives longest, quietly wrong |
| **Confidence** | Anyone can change anything | The expensive one, and the last to come back |

> **Read the right column bottom to top.** That's the order you lose them in, and the order you have to earn them back.

---

eyebrow: THE DIAGNOSIS
badge: START HERE

## Five questions, and only four have answers

1. **Does it fail on a clean checkout?** Then it is your environment, which is still a bug worth naming.
2. **Does it fail alone?** If it passes alone and fails in a suite, that is a fact about shared state.
3. **Does the order matter?** Randomise it once; you will learn more than a week of staring teaches.
4. **Is it a real race?** Then the test is right and the code is wrong &mdash; the good outcome, and the rarest.
5. **How long has it been like this?**

> [!ASIDE] The fifth has no answer on purpose. Almost nobody can say, because nobody was measuring, and that absence is the finding.

---

eyebrow: SHARED STATE

## Isolation, or the appearance of it
Most flakes are two tests disagreeing about something neither of them owns.

group: THE USUAL CULPRITS
### A database that persists between tests
Truncation between cases is not isolation. It is isolation until someone adds a test that depends on a row surviving.

### A module-level cache
Fast, invisible, and shared. `import` runs once; your setup runs every time.

group: THE FIX THAT ACTUALLY HOLDS
### Construct it fresh, per test {accent}
Slower. Correct. If that trade is genuinely too expensive, measure it before deciding &mdash; the estimate is usually wrong by an order of magnitude.

### Make sharing explicit
A fixture that is deliberately shared and documented is fine. It is the accidental sharing that costs you afternoons.

> **The question that finds these:** what does this test assume already exists? Ask it out loud and the answer is often embarrassing.

---

eyebrow: TIME

## Anything that reads the clock is suspect
Time-dependent tests fail on the build machine, on a Monday, in a timezone nobody has, during a leap second.

| The pattern | Why it fails | What to do instead |
|---|---|---|
| `sleep(100)` | 100ms is enough on your laptop | Wait for the condition, with a generous ceiling |
| `expect(Date.now())` | The clock moves between the two lines | Inject the clock |
| A one-second timeout | CI is contended <b>and</b> occasionally slow | Timeout on the <i>test</i>, not the assertion |
| Anything with a timezone | Your machine is not the build machine | Pin it, explicitly, in the test |
| `retry & hope` | R&D time spent re-running is still spent | Fix it, quarantine it, or delete it |

> **A wait is not a sleep.** Polling for the thing you actually want takes the same line count and removes an entire category of failure. See <code>waitFor</code> in whichever framework you use &mdash; they all have one.

---

eyebrow: THE PART PEOPLE SKIP

> A test that has never failed has never been tested.

## Prove the test can fail
The most common defect in a test suite is not a flaky test. It is a test that passes unconditionally and always has.

- **Break the code on purpose.** Change the thing under test and watch the test go red. If it stays green, you have found a second bug.
- **Break the assertion.** Invert it. A test that passes both ways is asserting nothing, whatever its name claims.
- **Do it when you write it.** Retrofitting this to a suite of four hundred is a project. Doing it once per test is thirty seconds.

> **This is not theory.** Two tests written for this very deck's repository passed against an application that was genuinely broken, and were only caught by deliberately reintroducing the defect they claimed to cover.

---

eyebrow: THE ORDER
badge: DO THIS

## Fix in this order, not the obvious one
The instinct is to start with the noisiest test. The instinct is wrong.

1. **Measure first.** Record which tests fail and how often. Without a baseline you cannot tell a fix from a coincidence.
2. **Quarantine, do not delete.** Quarantined still runs and reports; it just does not block.
3. **Fix shared state first.** One cause, many symptoms &mdash; the count drops faster than anyone expects.
4. **Then the clock, then the genuine races**, which are real bugs deserving real fixes.
5. **Then delete what is left.**

> **Quarantine has a half-life.** A quarantine list with no expiry date is a deletion with extra steps. Put a date on it.

---

eyebrow: WHAT GOOD LOOKS LIKE

## Two numbers worth watching
Not a dashboard. Two numbers, reviewed when someone remembers.

### Runs since the last unexplained failure
Counts up. Resets to zero when something fails for a reason nobody can name.<br>Everyone understands it without a legend, which is most of its value.

### Time from red to a named cause {accent}
The real measure of whether the suite is useful. A suite that fails fast and explains itself is worth more than a suite that rarely fails and never explains anything.

> [!ASIDE] Deliberately not a percentage. A flake rate averages away the thing you care about, which is whether *this* failure, today, means something.

---

eyebrow: CLOSING

## What to say on Monday
None of this needs a project, a budget, or permission.

group: THIS WEEK
### Turn on order randomisation
One flag in most runners. It will find something. Expect that, and do not treat the first red as a setback.

### Start the list
Which tests failed, and when. A text file is a perfectly good instrument.

group: THIS MONTH
### Fix one shared-state cause
Not one test. One cause. Then count how many tests stopped failing.

### Break something on purpose {accent}
Pick the test you would least like to be wrong about, and prove it can fail.

> **The goal is not zero failures.** It is that every failure means something. A suite that goes red for a reason is doing its job.

> [!ASIDE] Notes, the retro that prompted this, and the raw build history are in <a href="https://example.com/flaky-test-notes">the working notes</a>. Corrections welcome &mdash; especially from anyone whose suite is worse than ours was.
