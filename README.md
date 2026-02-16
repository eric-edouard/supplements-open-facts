# supplements-open-facts

> **Supplements Open Facts** – an open‑science catalogue of evidence about dietary supplements.  
> Every fact is traceable to a DOI and stored in plain text so humans *and* machines can audit it.

---

## 📖 What's inside?

* **Transparent** – Each claim is a commit with author, timestamp and paper link.  
* **Structured** – Strict JSON Schemas keep the facts machine‑friendly.  
* **Open** – Licensed CC‑BY‑4.0;

---

## 📂 Top‑level layout

```
supplements-open-facts/
├─ supplements/
│   └─ <slug>/                  # one folder per supplement
│       ├─ meta.yml             # metadata
│       └─ claims/
│           ├─ effects/
│           ├─ biomarkers/
│           ├─ cycles/
│           ├─ interactions/
│           ├─ formulations/
│           ├─ toxicity/
│           ├─ synergies/
│           └─ addiction-withdrawal/
├─ vocab/                      # controlled term lists
│   ├─ effects.yml             # list of effects slugs
│   └─ biomarkers.yml          # list of biomarker slugs
├─ schemas/                    # JSON Schemas used by CI
└─ .github/                    # CI workflows & templates
```

---

## 🗂️ Supplement metadata `meta.yml`

| key | type | required | example |
|-----|------|----------|---------|
| `slug` | string | ✔︎ | `creatine` |
| `name` | string | ✔︎ | `Creatine Monohydrate` |
| `synonyms` | string[] | – | `[creatine, creapure]` |
| `dosage_unit` | ✔︎ | microgram / milligram / gram / millilitre / IU  | `gram` |
| `created` | date | auto | |

Everything else lives in **claim files** so we always know which paper says what.

Example:
```yaml
slug: l-theanine
name: L-Theanine
synonyms: [theanine, suntheanine, liposomal theanine]
dosage_unit: milligram
created: 2025-01-15
```

---

## 📑 Claim files

### File Naming Convention

To keep the dataset clean, descriptive, and audit-friendly, every claim file follows this naming convention based on the claim content:

**Effects:** `{kind}-{effect}-{direction}-{strength}.yml`

**Biomarkers:** `{biomarker}-{direction}-{strength}.yml`

**Interactions:** `{target}-{danger_level}.yml`

**Formulations:** `{formulation}-{change|change_percent}pct.yml`

**Toxicity:** `{threshold_amount}mg-toxicity.yml`

**Cycles:** `{on_off_pattern}-cycle.yml`

**Synergies:** `{with_compound}-{strength|change_percent}pct.yml`

**Addiction-withdrawal:** `{symptom_slug}.yml`

#### Examples

**Effects:**
```
intended-muscle-strength-positive-strong.yml
intended-sleep-quality-positive-moderate.yml
adverse-nausea-negative-weak.yml
```

**Biomarkers:**
```
blood-glucose-negative-strong.yml
cortisol-negative-moderate.yml
crp-negative-strong.yml
```

**Interactions:**
```
warfarin-mild.yml
caffeine-low.yml
aspirin-severe.yml
```

**Formulations:**
```
liposomal-positive.yml
enteric-coated-neutral.yml
time-release-120pct.yml
```

**Toxicity:**
```
1000mg-toxicity.yml
500mg-toxicity.yml
gi-distress-toxicity.yml
```

**Cycles:**
```
5-2-cycle.yml              # 5 days on, 2 days off
8w-4w-cycle.yml           # 8 weeks on, 4 weeks off
none-cycle.yml            # no cycling needed
```

**Synergies:**
```
citrulline-strong.yml
vitamin-d-120pct.yml
magnesium-moderate.yml
```

**Addiction-withdrawal:**
```
rebound-insomnia.yml
tolerance.yml
withdrawal-anxiety.yml
```

#### 🧾 Why this format?

	•	**Content-descriptive:** File name immediately tells you what the claim is about
	•	**No external dependencies:** Don't need to look up publication dates
	•	**Filesystem-safe:** No special characters or dates that could be incorrect
	•	**Human-readable:** Easy to understand what each file contains at a glance
	•	**Sortable:** Claims group naturally by type and effect

⚠️ **Handling duplicates:** If multiple claims have identical names, suffix with -2, -3, etc.

```
intended-muscle-strength-positive-strong.yml
intended-muscle-strength-positive-strong-2.yml
```

## Claim File Content - Common keys

| key | req | notes |
|-----|-----|-------|
| `created` | ✔︎ | date created |
| `contributor` | ✔︎ | email / github link profile |
| `paper` | ✔︎ | DOI |
| `paper_quotes` | - | verbatim quotes from the paper supporting the claim |
| `misc` | - | free text |

### Paper Quotes Structure

The `paper_quotes` field allows you to include verbatim quotes from the paper that support the claim:

```yaml
paper_quotes:
  abstract:
    - "First quote from abstract"
    - "Second quote from abstract"
  paper_content:
    - "Quote from the paper body"
    - "Another quote from methods or results"
```

Example: 
```yaml
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

# Optional paper quotes
paper_quotes:
  abstract:
    - "Creatine supplementation significantly increased muscle strength by 23% (p<0.05)"
  paper_content:
    - "Muscle biopsies showed 35% increase in phosphocreatine stores"

# --- type‑specific keys follow ---
```

---

## 📚 Type‑specific keys & examples

### Effects `supplements/<slug>/claims/effects/*.yml`

| key | req | notes |
|-----|-----|-------|
| `effect` | ✔︎ | slug from vocab/effects.yml |
| `kind` | ✔︎ | intended / adverse / neutral |
| `direction` | ✔︎ | positive / negative / neutral |
| `description` | - | Free text describing the effect observed. |
| `strength` | ✔︎ | strong / moderate / weak / none (see Strength scale) |
| `p_value` | - | positive / negative / neutral |
| `effect_size` | - | free text |
| `dosage` | - | structured object with min, max, and unit fields |
| `onset_duration` | - | structured object indicating when effects begin |
| `timing` | - | [upon-waking / morning / afternoon / evening / bedtime / pre-meal / with-meal / post-meal / between-meals / empty-stomach / pre-exercise / intra-exercise / post-exercise] |

#### Strength scale

| strength | What it means (within this paper) |
|----------|-----------------------------------|
| **strong**   | Primary outcome, p < 0.05, adequate N |
| **moderate** | Significant secondary outcome or trend (0.05–0.10) |
| **weak**     | Non‑significant directional change |
| **none**     | Paper reports "no effect" |

#### Dosage Structure

The `dosage` field uses a structured format to specify dosage amounts and units. You can use either a single value, a range, or both:

**Single value:**
```yaml
dosage:
  value: 5        # exact dose (number)
  unit: "gram"    # required unit
```

**Range:**
```yaml
dosage:
  min: 3          # minimum effective dose (number)
  max: 5          # maximum recommended dose (number)  
  unit: "gram"    # required unit
```

**Both value and range:**
```yaml
dosage:
  value: 4        # typical/recommended dose (number)
  min: 3          # minimum effective dose (number)
  max: 5          # maximum recommended dose (number)
  unit: "gram"    # required unit
```

**Valid dosage units:** `microgram`, `milligram`, `gram`, `kilogram`, `IU`, `mg/kg`, `g/kg`

#### Onset Duration Structure

The `onset_duration` field specifies when effects typically begin. Like dosage, you can use a single value, range, or both:

**Single value:**
```yaml
onset_duration:
  value: 1        # typical onset time (number)
  unit: "hours"   # required unit
```

**Range:**
```yaml
onset_duration:
  min: 1          # earliest onset time (number)
  max: 2          # latest onset time (number)
  unit: "hours"   # required unit
```

**Both value and range:**
```yaml
onset_duration:
  value: 1.5      # typical onset time (number)
  min: 1          # earliest onset time (number)
  max: 2          # latest onset time (number)
  unit: "hours"   # required unit
```

**Valid onset duration units:** `immediate`, `minutes`, `hours`, `days`, `weeks`, `months`, `years`

For immediate effects:
```yaml
onset_duration:
  value: 0
  unit: "immediate"
```

Example: 
```yaml
# Common keys
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

# Effect keys
effect: muscle-strength
kind: intended
direction: positive
description: "Increases maximal voluntary contraction force"
strength: strong
p_value: 0.02
effect_size: "Cohen's d = 0.8"

# Effect Dosage keys
dosage:
  value: 4
  min: 3
  max: 5
  unit: "gram"
onset_duration:
  value: 1.5
  min: 1
  max: 2
  unit: "hours"
timing: pre-exercise

```

---

### Biomarkers `supplements/<slug>/claims/biomarkers/*.yml`

| key | req | notes |
|-----|-----|-------|
| `biomarker` | ✔︎ | slug from vocab/biomarkers.yml |
| `direction` | ✔︎ | positive / negative / neutral |
| `strength` | - | If applicable: strong / moderate / weak / none (see Strength scale) |
| `dosage` | - | structured object with min, max, and unit fields |
| `onset_duration` | - | structured object indicating when effects begin |
| `timing` | - | [upon-waking / morning / afternoon / evening / bedtime / pre-meal / with-meal / post-meal / between-meals / empty-stomach / pre-exercise / intra-exercise / post-exercise] |

Example: 
```yaml
# Common keys
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

# Biomarker keys
biomarker: blood-pressure
direction: positive

# Biomarker Dosage keys
dosage:
  value: 1500
  unit: "milligram"
onset_duration:
  min: 2
  max: 4
  unit: "weeks"
timing: pre-exercise

```



---

### Cycles `supplements/<slug>/claims/cycles/*.yml`

| key | req | notes |
|-----|-----|-------|
| `cycle` | ✔︎ | none / suggested / recommended |
| `days_on_off` | cond. | number-number (if suggested or recommended) |
| `weeks_on_off` | cond. | number-number (if suggested or recommended) |
| `months_on_off` | cond. | number-number (if suggested or recommended) |

Example:
```yaml
# Common keys
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

# Cycle keys
cycle: suggested
days_on_off: 5-2 # weekdays, stop of week-ends
```

---

### Interactions  `supplements/<slug>/claims/interactions/*.yml`

| key | req | notes |
|-----|-----|-------|
| `target` | ✔︎ | compound it interacts with |
| `danger_level` | ✔︎ | low / mild / severe |
| `description` | - | free text |

```yaml
# Common keys
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

# Interaction keys
target: warfarin
danger_level: mild
description: May potentiate anticoagulant effect
```

---

### Formulations `supplements/<slug>/claims/formulations/*.yml`

| key | req | notes |
|-----|-----|-------|
| `formulation` | ✔︎ | interacts with |
| `change` | cond. | negative / slightly-negative / neutral / slightly-positive / positive /  |
| `change_percent` | cond. | change of effect strength |

> Either one of change or change_percent must be defined 

```yaml
# Common keys
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

# Formulation keys
formulation: liposomal
change_percent: 120
```


---

### Toxicity / upper‑limit `supplements/<slug>/claims/toxicity/*.yml`

| key | req | notes |
|-----|-----|-------|
| `threshold_amount` | ✔︎ | in the sam unit descrribted in <supplement>/meta.yml |
| `change` | cond. | negative / slightly-negative / neutral / slightly-positive / positive /  |
| `change_percent` | cond. | change of effect strength |


```yaml
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

threshold_amount: 1000
effect: gastrointestinal-distress
population: adults
```

---

### Synergies `supplements/<slug>/claims/synergies/*.yml`

| key | req | notes |
|-----|-----|-------|
| `with_compound` | ✔︎ | with other supplement or free text |
| `strength` | cond | light / mild / strong |
| `change_percent` | cond | number |

> At least one of `strength` or `change_percent` must be defined

```yaml
with_compound: citrulline
strength: light
```

---

### Addiction / Withdrawal `supplements/<slug>/claims/addiction-withdrawal/*.yml`

| key | req | notes |
|-----|-----|-------|
| `symptom` | ✔︎ | free text describing the withdrawal symptom |
| `incidence_percent` | - | percentage of users experiencing the symptom |

Example:
```yaml
# Common keys
created: 2025-05-18
contributor: alice@example.com
paper: 10.1038/s41586-2024-00001

# Addiction / Withdrawal keys
symptom: rebound insomnia
incidence_percent: 20
```

---

## 🤝 How to contribute

### Pull request

1. Create a branch.  
2. Create your `.yml` claim files into the correct supplement folder and make sure they are the proper format and follow the guidelines as described above
3. If you created new supplements, just add them to supplements/ and don't forget to create the meta.yml for this supplement
3. If you created new vocabulary, don't forget to add it in ./vocab/
3. `npm install && npm run validate` to check against schemas.  
4. Open PR

### CI gates every PR

* JSON Schema ✔︎  
* DOI resolves ✔︎  

Green ticks → human review → merge.