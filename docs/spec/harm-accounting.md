# Harm accounting

How many, how badly, for how long, and to whom — with the uncertainty left in.

This exists because "contribution of value for the collective" is otherwise
unfalsifiable. If harm cannot be described, an intelligence network cannot say
whether noticing something mattered, and every finding is equally important,
which means none of them are.

It is also the most dangerous thing in the codebase, and not for technical
reasons. Putting a number on suffering does three things at once:

- it makes harm **comparable**, which is necessary for deciding where to look;
- it makes harm look **measured**, whether or not it was;
- it decides **whose suffering counts**, because whatever is not counted reads
  as zero.

The design answers each.

## Nothing is a point estimate

Every quantity is a range with a stated method and basis (`counted`, `sampled`,
`modelled`, `reported`). "Between 200 and 2,000, modelled from displacement
rates in comparable events" is honest. "1,100" is a decision wearing the
clothes of a measurement.

Two ranges that overlap **cannot be ordered**, and `comparableOn` refuses to
try. Taking midpoints to break the tie manufactures a distinction the evidence
does not contain.

## Unknown is not zero

`UnknownQuantity` carries a required `whyNot`. "No data", "we did not look",
and "the sources disagree irreconcilably" are different states with different
remedies, and a null erases the difference.

`weighHarm` **refuses** to produce a number when its inputs are unknown, rather
than substituting zero. This is the single most important behaviour here. A
scorer that reads missing data as "no harm" will always rank well-documented
harms above undocumented ones — which means it ranks by how much attention a
population has already received. That is precisely backwards for a network
whose purpose is to notice what is being missed.

## Severity is ordinal, and stays that way

`inconvenience → material-loss → injury → lasting-injury → death` are not
numbers, on purpose. Numbering them invites averaging severity across a
population or multiplying it by a headcount, and neither operation means
anything. Two people displaced is not "one death's worth" of harm at any
exchange rate this module is entitled to set.

## Who bears it is part of the account

The same total falling on different people is not the same event. `agency`
records whether the bearers had any say — `unknown` must never be read as
consent. `compounding` records whether they were already carrying other
documented harms.

## There is no total

`weighHarm` requires the caller to supply `HarmWeights`, including a written
`rationale`, and there is **no default and will not be one**. A default would
be this codebase deciding, on behalf of everyone who ever calls it, how many
displaced people equal one death.

The weights are returned alongside the result so a reader can disagree with the
specific judgement rather than with the number it produced.

## Status

The model and its tests exist; **nothing consumes it yet, and that is the
correct state rather than an omission.** Wiring it into ranking would require
choosing severity weights here, which is the one thing the design refuses. A
surface that wants a scalar must state its own weights and publish them.

`scripts/guard-orphan-exports.mjs` records that status explicitly, so it
surfaces as a decision rather than as forgotten code.
