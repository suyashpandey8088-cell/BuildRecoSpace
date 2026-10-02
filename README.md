# RecoSpace — End-to-End Recommendation Engine & Analytics Studio

**RecoSpace** is an interactive web analytics platform for end-to-end recommendation systems. It covers the complete machine learning lifecycle: data ingestion and schema mapping, automated data cleansing, non-leaking dataset splitting, multi-model ranking, offline ranking evaluation, and popularity bias analysis with real-time mitigation simulation.

---

## 🚀 Tech Stack & Design Choices

- **Frontend & Runtime:** React 19 + TypeScript + Vite
  - *Rationale:* Client-side execution in TypeScript with TypedArrays and dense/sparse linear algebra enables instant, sub-millisecond hyperparameter tuning, model re-training, and interactive simulations without network round-trips.
- **Styling & UI System:** Tailwind CSS v4 + Lucide Icons
  - *Design System:* Dark slate theme (`slate-950` / `indigo-600`), readable typography, responsive layouts across desktop/tablet/mobile, semantic headings, and high-contrast color coding.
- **Data Parsing & Utilities:** PapaParse + deterministic seeded pseudo-random number generators (Mulberry32 PRNG).
- **Automated Testing:** Vitest for comprehensive unit and integration test coverage.

---

## 📊 Core Features & Architecture

### 1. Data Ingestion & Preloaded Datasets
- **Preloaded Datasets:**
  1. *MovieLens Cinema Ratings:* 45 users, 25 movies across 6 genres (Sci-Fi, Action, Drama, Comedy, Animation, Horror), 1-5 star ratings, 90-day timestamps.
  2. *E-Commerce Tech Retail:* 40 consumers, 20 hardware SKUs (Laptops, Audio, Gaming), purchase funnel weights (1=View, 3=Cart, 5=Purchase).
  3. *Tech Knowledge Articles:* 38 software engineers, 16 articles, reader claps, topic categories.
  4. *Online Learning Academy:* 35 students, 12 CS & design courses, course completion scores.
- **Custom Data Loading:** Supports drag-and-drop or file upload for `.csv`, `.tsv`, `.txt` as well as raw text paste with live delimiter detection and schema preview.

### 2. Data Preparation & Cleansing Pipeline
- **Interactive Column Mapping:** Map source fields to User ID, Item ID, Interaction Value, Timestamp, Item Name, Category/Genre, and User Segment.
- **Missing Value Policy:** Configurable row dropping vs. default value imputation.
- **Duplicate Interaction Resolution:** Deduplicate user-item pairs using *Keep Latest*, *Keep Earliest*, *Average Ratings*, *Sum Weights*, or *Keep Max*.
- **K-Core Activity Filtering:** Filter low-activity users ($k \ge 1..10$) and low-frequency items iteratively.
- **Positive Feedback Definition:** Configurable explicit rating thresholds (e.g., $\ge 4.0$) or implicit positive feedback flags.
- **Audit Ledger:** Chronological transformation log recording every row kept, dropped, or imputed with reasons and timestamps.

### 3. Recommendation Algorithms & Explainability
- **Popularity Baseline:** Global interaction volume, average rating, Bayesian weighted score, and optional exponential time-decay.
- **Item-Based Collaborative Filtering (Item-CF):** Precomputes item-item similarity matrix using Adjusted Cosine (user-mean centered), standard Cosine, or Jaccard similarity. Generates explicit signals identifying the exact historical items that drove each recommendation.
- **User-Based Collaborative Filtering (User-CF):** Discovers top-$N$ nearest peer neighbors via Pearson correlation or Cosine similarity with mean-centered score propagation.
- **Matrix Factorization (Latent SVD / SGD):** Decomposes the user-item interaction matrix into low-rank latent representations $P_u$ and $Q_i$ with regularized stochastic gradient descent and deterministic initialization.
- **Content-Based Filtering:** TF-IDF feature extraction on item categories and titles; builds user taste profiles to recommend high-cosine-affinity items.
- **Hybrid Ensemble:** Weighted combination blending CF ($w_{\text{cf}}$), Content ($w_{\text{cnt}}$), and Popularity ($w_{\text{pop}}$).
- **Cold-Start Fallbacks & Deterministic Ties:** Automatic graceful fallback for unknown users; deterministic tie-breaking (Score DESC $\rightarrow$ Popularity DESC $\rightarrow$ Item ID ASC).

### 4. Non-Leaking Splits & Evaluation Benchmark
- **Split Strategies:**
  - *Temporal Holdout:* Chronologically ordered split ($t_{\text{train}} \le t_{\text{val}} \le t_{\text{test}}$) strictly preventing future leakage.
  - *User-Stratified Random Split:* Per-user holdout using deterministic seeded PRNG.
  - *Global Random Shuffle:* Seeded reproducible random split.
- **Leakage Integrity Verification:** Automated check ensuring disjoint interaction sets and temporal monotonicity.
- **Offline Ranking Metrics:**
  - $\text{Precision}@K$ and $\text{Recall}@K$
  - $\text{NDCG}@K$ (Normalized Discounted Cumulative Gain)
  - $\text{MRR}@K$ (Mean Reciprocal Rank)
  - Catalog Coverage % ($|\bigcup_u \text{Top } K(u)| / |I|$)
  - Gini Diversity Index (Inequality in recommendation exposure)
  - Novelty Score (Self-information bits: $-\log_2 P(i)$)
  - Multi-$K$ evaluation trend comparison ($K \in \{3, 5, 10, 20\}$).

### 5. Popularity Bias & Fairness Mitigation
- **Popularity Concentration Analysis:** Head (Top 20%), Mid (20-50%), and Long-Tail (Bottom 50%) volume distribution.
- **Group Fairness Disparity:** Accuracy (NDCG, Recall) broken down across user activity tiers (Casual, Moderate, Power users) and user cohorts.
- **Epistemological Disclaimer:** Explicitly labels findings as empirical observational measurements (observational correlation does not imply causation; no sensitive traits inferred).
- **Live Mitigation Simulator:**
  - Popularity penalty discounting: $S_{\text{mitigated}}(i) = S_{\text{orig}}(i) \cdot (1 - \lambda \cdot \frac{\log(1 + \text{pop}_i)}{\log(1 + \text{pop}_{\max})})$
  - Category exposure diversity quotas (caps maximum items per category in top-$K$).
  - Live before/after side-by-side comparison showing relevance vs. diversity trade-offs.

### 6. Export & Reproducibility
- Export prepared datasets as CSV.
- Export evaluation reports and benchmarks as JSON or CSV.
- Export reproducible experiment configuration manifests.

---

## 🛠️ Running the Application Locally

### Prerequisites
- Node.js v18+ (tested on Node v22)
- npm v9+

### Installation & Startup
```bash
# Install dependencies
npm install

# Start Vite dev server on port 5173
npm run dev

# Run automated Vitest test suite
npm test

# Build for production
npm run build
```

---

## 🧪 Verification & Automated Testing

Automated test suites in `tests/` cover:
- CSV/TSV parser, column type inference, and empty/malformed row validation.
- Schema mapping validation and missing column detection.
- Deduplication strategies (*keep latest*, *average*, *sum*, *max*).
- $k$-core user and item iterative filtering.
- Non-leaking temporal holdouts and user-stratified splits.
- Deterministic tie-breaking behavior and rank invariance.
- Recommendation accuracy across all 6 models (Popularity, Item-CF, User-CF, SVD, Content, Hybrid).
- Graceful cold-start fallback handling for unknown users.
- Metric calculation mathematical verification (Precision, Recall, NDCG, MRR, Gini).
- Calibrated re-ranking and category quota constraint verification.

---

## ⚠️ Known Limitations & Scope

1. **Browser In-Memory Scale:** Suitable for interactive exploratory data analysis on datasets up to tens of thousands of interactions. For massive multi-million interaction datasets, batch processing with distributed backends (e.g., PySpark, Ray) is recommended.
2. **Metadata Feature Scope:** Content-based filtering extracts term frequencies and TF-IDF representations from text and categorical tags; deep multimodal embeddings (e.g., raw audio/video frames) are not processed client-side.
3. **Observational Data Boundaries:** Offline ranking evaluation assumes interactions represent user preferences. Exposure bias in the source data may impact absolute metric levels.
