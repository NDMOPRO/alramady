import { runGoldenCorpus } from '../ci/golden_corpus_runner.ts';

runGoldenCorpus().catch((error) => {
  console.error(error);
  process.exit(1);
});
