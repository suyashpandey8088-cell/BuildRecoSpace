/**
 * Sample datasets with realistic interaction patterns, timestamps, categories, and user segments.
 */

export interface SampleDatasetDefinition {
  id: string;
  name: string;
  domain: string;
  description: string;
  defaultMapping: {
    userIdCol: string;
    itemIdCol: string;
    interactionCol: string;
    timestampCol: string;
    itemNameCol: string;
    itemCategoryCol: string;
    userSegmentCol: string;
  };
  defaultPrepConfig: {
    missingValueHandling: 'drop_row' | 'fill_default';
    defaultInteractionValue: number;
    duplicateHandling: 'keep_latest' | 'average';
    positiveThresholdRule: 'explicit_threshold' | 'implicit_positive';
    positiveThresholdValue: number;
    minUserInteractions: number;
    minItemInteractions: number;
  };
  csvData: string;
}

// Generate realistic Movie dataset
const generateMovieDataset = (): string => {
  const movies = [
    { id: 'M101', title: 'Inception', category: 'Sci-Fi' },
    { id: 'M102', title: 'Interstellar', category: 'Sci-Fi' },
    { id: 'M103', title: 'The Matrix', category: 'Sci-Fi' },
    { id: 'M104', title: 'Blade Runner 2049', category: 'Sci-Fi' },
    { id: 'M105', title: 'Dune: Part One', category: 'Sci-Fi' },
    { id: 'M201', title: 'The Dark Knight', category: 'Action' },
    { id: 'M202', title: 'Mad Max: Fury Road', category: 'Action' },
    { id: 'M203', title: 'John Wick', category: 'Action' },
    { id: 'M204', title: 'Gladiator', category: 'Action' },
    { id: 'M205', title: 'Avengers: Endgame', category: 'Action' },
    { id: 'M301', title: 'The Shawshank Redemption', category: 'Drama' },
    { id: 'M302', title: 'The Godfather', category: 'Drama' },
    { id: 'M303', title: 'Parasite', category: 'Drama' },
    { id: 'M304', title: 'Whiplash', category: 'Drama' },
    { id: 'M305', title: 'Forrest Gump', category: 'Drama' },
    { id: 'M401', title: 'The Grand Budapest Hotel', category: 'Comedy' },
    { id: 'M402', title: 'Superbad', category: 'Comedy' },
    { id: 'M403', title: 'Knives Out', category: 'Comedy' },
    { id: 'M404', title: 'Everything Everywhere All at Once', category: 'Comedy' },
    { id: 'M501', title: 'Spirited Away', category: 'Animation' },
    { id: 'M502', title: 'Spider-Man: Into the Spider-Verse', category: 'Animation' },
    { id: 'M503', title: 'Your Name', category: 'Animation' },
    { id: 'M601', title: 'Alien', category: 'Horror' },
    { id: 'M602', title: 'The Shining', category: 'Horror' },
    { id: 'M603', title: 'Get Out', category: 'Horror' },
  ];

  const segments = ['Cinephile', 'Casual Viewer', 'Family', 'Action Enthusiast', 'Sci-Fi Geek'];
  const baseTime = 1704067200000; // 2024-01-01
  const dayMs = 86400000;

  const rows: string[] = ['user_id,movie_id,movie_title,genre,rating,timestamp,user_cohort'];

  // Seeded deterministic generator
  let seed = 12345;
  const pseudoRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const usersCount = 45;
  for (let u = 1; u <= usersCount; u++) {
    const userId = `USR_${String(u).padStart(3, '0')}`;
    const segment = segments[u % segments.length];
    
    // User preference bias by genre
    let preferredGenre = 'Sci-Fi';
    if (segment === 'Action Enthusiast') preferredGenre = 'Action';
    else if (segment === 'Cinephile') preferredGenre = 'Drama';
    else if (segment === 'Family') preferredGenre = 'Animation';
    else if (segment === 'Casual Viewer') preferredGenre = 'Comedy';

    const numRatings = Math.floor(pseudoRand() * 14) + 6; // 6 to 19 ratings per user
    const ratedMovieIndices = new Set<number>();

    for (let r = 0; r < numRatings; r++) {
      let movieIdx = Math.floor(pseudoRand() * movies.length);
      // Bias towards preferred genre
      if (pseudoRand() < 0.6) {
        const matchingMovies = movies.map((m, idx) => ({ m, idx })).filter(item => item.m.category === preferredGenre);
        if (matchingMovies.length > 0) {
          movieIdx = matchingMovies[Math.floor(pseudoRand() * matchingMovies.length)].idx;
        }
      }
      if (ratedMovieIndices.has(movieIdx)) continue;
      ratedMovieIndices.add(movieIdx);

      const movie = movies[movieIdx];
      // Higher rating if genre matches preference
      let rating = 3.0 + Math.floor(pseudoRand() * 3); // 3, 4, 5
      if (movie.category === preferredGenre && pseudoRand() > 0.2) {
        rating = pseudoRand() > 0.4 ? 5.0 : 4.5;
      } else if (pseudoRand() < 0.15) {
        rating = 2.0;
      }

      const timeOffset = Math.floor(pseudoRand() * 90) * dayMs + Math.floor(pseudoRand() * dayMs);
      const isoDate = new Date(baseTime + timeOffset).toISOString();

      rows.push(`${userId},${movie.id},"${movie.title}",${movie.category},${rating.toFixed(1)},${isoDate},${segment}`);
    }
  }

  return rows.join('\n');
};

// Generate E-Commerce dataset
const generateEcommerceDataset = (): string => {
  const products = [
    { id: 'PROD_APL_01', name: 'MacBook Pro 16" M3 Max', category: 'Laptops' },
    { id: 'PROD_APL_02', name: 'iPhone 15 Pro Max 256GB', category: 'Smartphones' },
    { id: 'PROD_APL_03', name: 'AirPods Pro 2nd Gen', category: 'Audio' },
    { id: 'PROD_APL_04', name: 'Apple Watch Ultra 2', category: 'Wearables' },
    { id: 'PROD_SNY_01', name: 'Sony WH-1000XM5 ANC Headphones', category: 'Audio' },
    { id: 'PROD_SNY_02', name: 'Sony Alpha A7 IV Camera Body', category: 'Cameras' },
    { id: 'PROD_SNY_03', name: 'PlayStation 5 Digital Console', category: 'Gaming' },
    { id: 'PROD_DEL_01', name: 'Dell XPS 15 OLED Touch Laptop', category: 'Laptops' },
    { id: 'PROD_DEL_02', name: 'Dell UltraSharp 32" 4K Hub Monitor', category: 'Monitors' },
    { id: 'PROD_LOG_01', name: 'Logitech MX Master 3S Mouse', category: 'Accessories' },
    { id: 'PROD_LOG_02', name: 'Logitech MX Mechanical Mini Keyboard', category: 'Accessories' },
    { id: 'PROD_LOG_03', name: 'Logitech Brio 4K Webcam', category: 'Accessories' },
    { id: 'PROD_SAM_01', name: 'Samsung Galaxy S24 Ultra', category: 'Smartphones' },
    { id: 'PROD_SAM_02', name: 'Samsung Odyssey Neo G9 Curved Monitor', category: 'Monitors' },
    { id: 'PROD_KSS_01', name: 'Keychron Q1 Pro Custom Mechanical Keyboard', category: 'Accessories' },
    { id: 'PROD_BOSE_1', name: 'Bose QuietComfort Ultra Headphones', category: 'Audio' },
    { id: 'PROD_CAN_01', name: 'Canon EOS R6 Mark II Mirrorless Camera', category: 'Cameras' },
    { id: 'PROD_ASUS_1', name: 'ASUS ROG Zephyrus G14 Gaming Laptop', category: 'Gaming' },
    { id: 'PROD_STM_01', name: 'Valve Steam Deck OLED 512GB', category: 'Gaming' },
    { id: 'PROD_ANK_01', name: 'Anker Prime 20000mAh Power Bank 200W', category: 'Accessories' },
  ];

  const tiers = ['Enterprise', 'Prosumer', 'Student', 'Gamer', 'Creator'];
  const baseTime = 1706745600000; // 2024-02-01
  const dayMs = 86400000;

  const rows: string[] = ['customer_id,product_sku,product_title,category,interaction_weight,timestamp,customer_tier'];

  let seed = 67890;
  const pseudoRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const usersCount = 40;
  for (let u = 1; u <= usersCount; u++) {
    const customerId = `CUST_${String(u).padStart(3, '0')}`;
    const tier = tiers[u % tiers.length];

    let targetCategory = 'Laptops';
    if (tier === 'Gamer') targetCategory = 'Gaming';
    else if (tier === 'Prosumer') targetCategory = 'Accessories';
    else if (tier === 'Creator') targetCategory = 'Cameras';
    else if (tier === 'Student') targetCategory = 'Audio';

    const numActions = Math.floor(pseudoRand() * 12) + 5;
    const visitedProducts = new Set<string>();

    for (let a = 0; a < numActions; a++) {
      let prodIdx = Math.floor(pseudoRand() * products.length);
      if (pseudoRand() < 0.55) {
        const matches = products.map((p, idx) => ({ p, idx })).filter(item => item.p.category === targetCategory);
        if (matches.length > 0) {
          prodIdx = matches[Math.floor(pseudoRand() * matches.length)].idx;
        }
      }
      if (visitedProducts.has(products[prodIdx].id)) continue;
      visitedProducts.add(products[prodIdx].id);

      const prod = products[prodIdx];
      // Weights: 1 = View, 3 = Cart, 5 = Purchased
      const randVal = pseudoRand();
      const weight = randVal > 0.65 ? 5 : randVal > 0.3 ? 3 : 1;

      const timeOffset = Math.floor(pseudoRand() * 60) * dayMs + Math.floor(pseudoRand() * dayMs);
      const isoDate = new Date(baseTime + timeOffset).toISOString();

      rows.push(`${customerId},${prod.id},"${prod.name}",${prod.category},${weight},${isoDate},${tier}`);
    }
  }

  return rows.join('\n');
};

// Generate Tech Articles dataset
const generateTechArticlesDataset = (): string => {
  const articles = [
    { id: 'ART_001', title: 'Building Distributed Systems with Raft and Go', category: 'Systems' },
    { id: 'ART_002', title: 'Deep Dive into Kubernetes Operators & CRDs', category: 'DevOps' },
    { id: 'ART_003', title: 'Fine-Tuning Llama 3 with LoRA and QLoRA', category: 'AI/ML' },
    { id: 'ART_004', title: 'Vector Databases Compared: Qdrant, Milvus & Pinecone', category: 'AI/ML' },
    { id: 'ART_005', title: 'Rust Memory Safety Without Garbage Collection', category: 'Systems' },
    { id: 'ART_006', title: 'React 19 Server Actions and React Compiler In Depth', category: 'Web Dev' },
    { id: 'ART_007', title: 'Zero-Trust Architecture in AWS and Cloudflare', category: 'Security' },
    { id: 'ART_008', title: 'PostgreSQL Indexing Internals and Query Planner Tuning', category: 'Databases' },
    { id: 'ART_009', title: 'Event-Driven Architectures with Apache Kafka and Flink', category: 'Systems' },
    { id: 'ART_010', title: 'Building High-Performance TypeScript Microservices', category: 'Web Dev' },
    { id: 'ART_011', title: 'Prompt Engineering vs RAG: When to Use What', category: 'AI/ML' },
    { id: 'ART_012', title: 'CI/CD Pipelines with GitHub Actions and Terraform', category: 'DevOps' },
    { id: 'ART_013', title: 'OAuth2 and WebAuthn Modern Authentication Best Practices', category: 'Security' },
    { id: 'ART_014', title: 'CSS Subgrid and Modern Responsive Layout Strategies', category: 'Web Dev' },
    { id: 'ART_015', title: 'Distributed Tracing with OpenTelemetry and Jaeger', category: 'DevOps' },
    { id: 'ART_016', title: 'ClickHouse for Real-Time Big Data Analytics', category: 'Databases' },
  ];

  const roles = ['Data Engineer', 'Backend Dev', 'Frontend Dev', 'ML Scientist', 'Security Analyst'];
  const baseTime = 1709251200000; // 2024-03-01
  const dayMs = 86400000;

  const rows: string[] = ['reader_id,article_id,article_title,topic,claps,timestamp,reader_role'];

  let seed = 45678;
  const pseudoRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const usersCount = 38;
  for (let u = 1; u <= usersCount; u++) {
    const readerId = `DEV_${String(u).padStart(3, '0')}`;
    const role = roles[u % roles.length];

    let targetTopic = 'AI/ML';
    if (role === 'Backend Dev') targetTopic = 'Systems';
    else if (role === 'Frontend Dev') targetTopic = 'Web Dev';
    else if (role === 'Security Analyst') targetTopic = 'Security';
    else if (role === 'Data Engineer') targetTopic = 'Databases';

    const numReads = Math.floor(pseudoRand() * 9) + 5;
    const readArticles = new Set<string>();

    for (let r = 0; r < numReads; r++) {
      let artIdx = Math.floor(pseudoRand() * articles.length);
      if (pseudoRand() < 0.6) {
        const matches = articles.map((a, idx) => ({ a, idx })).filter(item => item.a.category === targetTopic);
        if (matches.length > 0) {
          artIdx = matches[Math.floor(pseudoRand() * matches.length)].idx;
        }
      }
      if (readArticles.has(articles[artIdx].id)) continue;
      readArticles.add(articles[artIdx].id);

      const art = articles[artIdx];
      // Claps: 1 to 10
      const claps = Math.floor(pseudoRand() * 10) + 1;
      const timeOffset = Math.floor(pseudoRand() * 45) * dayMs + Math.floor(pseudoRand() * dayMs);
      const isoDate = new Date(baseTime + timeOffset).toISOString();

      rows.push(`${readerId},${art.id},"${art.title}",${art.category},${claps},${isoDate},${role}`);
    }
  }

  return rows.join('\n');
};

// Generate Online Courses dataset
const generateOnlineCoursesDataset = (): string => {
  const courses = [
    { id: 'CRS_PY_01', name: 'Python for Beginners & Beyond', category: 'Programming' },
    { id: 'CRS_PY_02', name: 'Advanced Python Design Patterns', category: 'Programming' },
    { id: 'CRS_DS_01', name: 'Applied Data Science with Pandas & NumPy', category: 'Data Science' },
    { id: 'CRS_DS_02', name: 'Statistical Inference & Hypothesis Testing', category: 'Data Science' },
    { id: 'CRS_ML_01', name: 'Machine Learning Fundamentals with Scikit-Learn', category: 'Machine Learning' },
    { id: 'CRS_ML_02', name: 'Deep Learning with PyTorch', category: 'Machine Learning' },
    { id: 'CRS_CLD_01', name: 'AWS Certified Solutions Architect Associate', category: 'Cloud Computing' },
    { id: 'CRS_CLD_02', name: 'Docker & Kubernetes in Production', category: 'Cloud Computing' },
    { id: 'CRS_UI_01', name: 'UI/UX Design Systems in Figma', category: 'Design' },
    { id: 'CRS_UI_02', name: 'Interaction Design & Micro-Animations', category: 'Design' },
    { id: 'CRS_SEC_01', name: 'Practical Cyber Security & Ethical Hacking', category: 'Security' },
    { id: 'CRS_PROD_1', name: 'Product Management from Zero to Hero', category: 'Business' },
  ];

  const levels = ['Beginner', 'Career Switcher', 'Senior Tech', 'Student', 'Upskilling Pro'];
  const baseTime = 1711929600000; // 2024-04-01
  const dayMs = 86400000;

  const rows: string[] = ['student_id,course_id,course_title,category,completion_score,timestamp,learner_level'];

  let seed = 31415;
  const pseudoRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const usersCount = 35;
  for (let u = 1; u <= usersCount; u++) {
    const studentId = `STU_${String(u).padStart(3, '0')}`;
    const level = levels[u % levels.length];

    let targetCategory = 'Data Science';
    if (level === 'Beginner') targetCategory = 'Programming';
    else if (level === 'Senior Tech') targetCategory = 'Cloud Computing';
    else if (level === 'Upskilling Pro') targetCategory = 'Machine Learning';

    const numCourses = Math.floor(pseudoRand() * 7) + 4;
    const takenCourses = new Set<string>();

    for (let c = 0; c < numCourses; c++) {
      let crsIdx = Math.floor(pseudoRand() * courses.length);
      if (pseudoRand() < 0.6) {
        const matches = courses.map((x, idx) => ({ x, idx })).filter(item => item.x.category === targetCategory);
        if (matches.length > 0) {
          crsIdx = matches[Math.floor(pseudoRand() * matches.length)].idx;
        }
      }
      if (takenCourses.has(courses[crsIdx].id)) continue;
      takenCourses.add(courses[crsIdx].id);

      const crs = courses[crsIdx];
      // Completion Score: 50 to 100
      const score = Math.floor(pseudoRand() * 40) + 60;
      const timeOffset = Math.floor(pseudoRand() * 40) * dayMs + Math.floor(pseudoRand() * dayMs);
      const isoDate = new Date(baseTime + timeOffset).toISOString();

      rows.push(`${studentId},${crs.id},"${crs.name}",${crs.category},${score},${isoDate},${level}`);
    }
  }

  return rows.join('\n');
};

export const SAMPLE_DATASETS: SampleDatasetDefinition[] = [
  {
    id: 'movielens-cinema',
    name: 'MovieLens Cinema Ratings',
    domain: 'Entertainment / Streaming',
    description: '45 users rating 25 movies across 6 genres (Sci-Fi, Action, Drama, Comedy, Animation, Horror) with 1-5 star ratings and 90-day timestamps.',
    defaultMapping: {
      userIdCol: 'user_id',
      itemIdCol: 'movie_id',
      interactionCol: 'rating',
      timestampCol: 'timestamp',
      itemNameCol: 'movie_title',
      itemCategoryCol: 'genre',
      userSegmentCol: 'user_cohort',
    },
    defaultPrepConfig: {
      missingValueHandling: 'drop_row',
      defaultInteractionValue: 3.5,
      duplicateHandling: 'keep_latest',
      positiveThresholdRule: 'explicit_threshold',
      positiveThresholdValue: 4.0,
      minUserInteractions: 3,
      minItemInteractions: 2,
    },
    csvData: generateMovieDataset(),
  },
  {
    id: 'ecommerce-retail',
    name: 'E-Commerce Tech Retail',
    domain: 'Online Shopping / Hardware',
    description: '40 tech consumers interacting with 20 premium hardware items (Laptops, Audio, Cameras, Gaming) with implicit purchase weights (1=View, 3=Cart, 5=Purchase).',
    defaultMapping: {
      userIdCol: 'customer_id',
      itemIdCol: 'product_sku',
      interactionCol: 'interaction_weight',
      timestampCol: 'timestamp',
      itemNameCol: 'product_title',
      itemCategoryCol: 'category',
      userSegmentCol: 'customer_tier',
    },
    defaultPrepConfig: {
      missingValueHandling: 'drop_row',
      defaultInteractionValue: 1.0,
      duplicateHandling: 'keep_latest',
      positiveThresholdRule: 'explicit_threshold',
      positiveThresholdValue: 3.0,
      minUserInteractions: 2,
      minItemInteractions: 2,
    },
    csvData: generateEcommerceDataset(),
  },
  {
    id: 'tech-dev-articles',
    name: 'Tech Knowledge & Engineering Articles',
    domain: 'Content / Tech Publishing',
    description: '38 software engineers & researchers clapping for 16 deep technical articles (Systems, DevOps, AI/ML, Security, Web Dev).',
    defaultMapping: {
      userIdCol: 'reader_id',
      itemIdCol: 'article_id',
      interactionCol: 'claps',
      timestampCol: 'timestamp',
      itemNameCol: 'article_title',
      itemCategoryCol: 'topic',
      userSegmentCol: 'reader_role',
    },
    defaultPrepConfig: {
      missingValueHandling: 'drop_row',
      defaultInteractionValue: 1.0,
      duplicateHandling: 'average',
      positiveThresholdRule: 'explicit_threshold',
      positiveThresholdValue: 5.0,
      minUserInteractions: 3,
      minItemInteractions: 2,
    },
    csvData: generateTechArticlesDataset(),
  },
  {
    id: 'online-learning-academy',
    name: 'Online Learning Hub Course Progress',
    domain: 'Education / EdTech',
    description: '35 learners across different skill levels completing 12 computer science & design courses with score percentages (60-100%).',
    defaultMapping: {
      userIdCol: 'student_id',
      itemIdCol: 'course_id',
      interactionCol: 'completion_score',
      timestampCol: 'timestamp',
      itemNameCol: 'course_title',
      itemCategoryCol: 'category',
      userSegmentCol: 'learner_level',
    },
    defaultPrepConfig: {
      missingValueHandling: 'drop_row',
      defaultInteractionValue: 70.0,
      duplicateHandling: 'keep_latest',
      positiveThresholdRule: 'explicit_threshold',
      positiveThresholdValue: 80.0,
      minUserInteractions: 2,
      minItemInteractions: 2,
    },
    csvData: generateOnlineCoursesDataset(),
  },
];
