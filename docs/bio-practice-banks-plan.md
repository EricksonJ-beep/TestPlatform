# Biology practice banks: practice built into Bloom

_Jon, Oct 14 2026 ("we need to get building the practice questions for Biology class now like we did for physical science. 50 question banks per learning target for Biology A and B"). Same plan as `docs/ps-practice-banks-plan.md`: every decision there carries over (Apps Script–style checking, 15/20/15 difficulty ramp, a hint and an explanation on every question, a reading with worked examples as the relearning activity, Jon's Drive as the source, spot-check review). Nothing new was built in the platform; this is content only._

## Size of the job

| Course | Unit | Targets | Questions |
| --- | --- | --- | --- |
| Biology A | 1 · The Science of Biology | 4 | 200 |
| Biology A | 2 · Biochemistry | 5 | 250 |
| Biology A | 3 · Cell Structure and Function | 4 | 200 |
| Biology A | 4 · Cell Energy | 4 | 200 |
| Biology B | 5 · Cell Growth & Division | 4 | 200 |
| Biology B | 6 · Genetics & Human Heredity | 3 | 150 |
| Biology B | 7 · DNA, RNA and Protein Synthesis | 4 | 200 |
| Biology B | 8 · Kingdoms | 5 | 250 |
| | **Total** | **33** | **1,650** questions + 33 relearning readings |

Each target is one pack, `content/packs/bio-u<U>-lt<N>-practice`: bank `Bio · U3.LT2 · Practice` (open for student-built practice), a published practice set `U3.LT2 Practice: …` dealing 10, and a published guided-notes reading `U3.LT2 Relearning: …`. The learning targets are the ones already seeded from `scripts/courses/biology.ts`; packs create none.

## Source material

Jon's Drive still files Biology under the old unit numbers. The map used:

| Course unit | Drive folder(s) under "1. Biology" |
| --- | --- |
| 1 · The Science of Biology | Unit 1 - The Science of Biology (2026), Unit 1. Intro to Biology, Graphing Practice, Lab Templates |
| 2 · Biochemistry | Unit 2. Biochemistry, pH_Lesson_Biology.pptx and pH Explore & Lab (Oct 2026) |
| 3 · Cell Structure and Function | Unit 3. Cell Structure and Function (LT1–LT3), Unit 4. Cell Transport (LT4), Bio Bellwork Weeks 1–11 |
| 4 · Cell Energy | Unit 5. Cell Energy (LT1–LT2), Unit 6. Photosynthesis (LT3–LT4) |
| 5 · Cell Growth & Division | Unit 7. Cell Division |
| 6 · Genetics & Human Heredity | Unit 8: Genetics, plus his Apps Script genetics projects |
| 7 · DNA, RNA and Protein Synthesis | Unit 9: DNA |
| 8 · Kingdoms | Unit 10: Classification, Unit 11: Bacteria, Unit 12: Protists, Unit 13: Fungi, Unit 14: Plants |

## Jon's conventions the banks follow

- **U1:** his six characteristics of life (Cells, Use Energy, Reproduction, Respond to Environment, Adaptation, Growth and Development); his 8-step scientific method; hypotheses as "If…, then…" (no "because", per his Biology Gimkit); his IV / DV / constants / control wording; total magnification = ocular × objective; his CER template.
- **U2:** O₂ is a molecule but not a compound; ions change electrons, isotopes change neutrons; each pH step is 10× (golf-score and Richter analogies); lock and key only (no induced fit); Benedict's needs heat, iodine yellow-brown → blue-black, Biuret blue → purple, Sudan IV and the brown-paper test; catalase in the potato lab (the reading notes his lab sheet says peroxidase).
- **U3:** cell theory as his three parts plus the two modern additions on his slide; his five scientists; "pro means no"; his organelle chart definitions and three plant-only features; tonicity named for the solution outside the cell; cytolysis (animal cell bursts) and plasmolysis (plant cell pulls from its wall); % change in mass = (final − initial) ÷ initial × 100.
- **U4:** 36 ATP aerobic vs 2 anaerobic; his order of the aerobic steps; his fermentation equations; light reactions in the thylakoid (PSII splits water, PSI makes NADPH), Calvin cycle in the stroma; limiting factors light, CO₂, temperature, water; Elodea and floating-leaf-disk labs.
- **U5:** PMAT with cytokinesis as its own step; his Time for Mitosis formula, (cells in phase ÷ total) × 720 min; his karyotype disorder list and "47, XXY" notation; his car analogy for proto-oncogenes (gas) and tumor suppressors (brakes).
- **U6:** ratios written "1 RR : 2 Rr : 1 rr = 1:2:1"; dihybrids in LT1 with "split and multiply"; incomplete dominance with two capitals (RW); codominance C^{R}C^{W}; blood types in his **Cadott Biology two-letter system** (AA, AO, BB, BO, AB, OO), not I^A; sex-linked genotypes always with chromosomes (X^{H}X^{h}, X^{b}Y); pedigrees with "?" for an unknown allele and I-1 / II-3 labels. Genotype fill-ins are case-sensitive.
- **U7:** twisted ladder; Chargaff's rule; G–C 3 hydrogen bonds, A–T 2; all the replication enzymes he teaches (helicase, SSB proteins, topoisomerase, primase, DNA polymerase, ligase); template strand 3'→5' starting TAC, mRNA 5'→3' starting AUG, dashed triplets, 3-letter amino acids; every translation item prints the codons it needs in the stem (with decoys), since there are no pictures.
- **U8:** seven levels from Kingdom (no domains) and six kingdoms; KPCOFGS mnemonics; bacteria doubling every 20 minutes; protozoa grouped by movement; his four fungus phyla, including Imperfect fungi as he teaches it; monocot / dicot chart; tree ID (MADOG, leaf arrangements); Big Three = N, P, K.

## For Jon to spot-check

Judgment calls the builders flagged (the pack's own explanation says what was keyed):

- **U1.LT4** graph titles keyed "DV vs. IV", like the Physical Science packs; his Biology slides only say the title should tell what the graph is about.
- **U1.LT2** an arctic fox's coat turning white each winter is Respond to Environment (his own matching key); small ears built up over generations is Adaptation.
- **U2.LT3** ocean pH 8.2 → 8.1 kept as his slide's "about 30% more H⁺" (the exact figure is about 26%).
- **U2.LT4** iodine's negative color is yellow-brown (2026 deck); the older deck says reddish orange.
- **U4.LT3** his test key marks "The Calvin cycle can happen at night" True; the banks avoid that statement, and one hard item asks why it stops soon in the dark.
- **U5** surface area to volume is not included (not in his materials); cancer treatments, p53, and a 47,XXX item are standard content beyond his files.
- **U6.LT2** polygenic traits (5 items) come only from an old co-teacher vocabulary list; tortoiseshell cats use "orange" (his worksheet says yellow and calls it incomplete dominance).
- **U7.LT4** silent / missense / nonsense use the standard definitions; his 2026 mutation lab handout calls a no-effect mutation "nonsense or silent", which is wrong (nonsense makes a stop codon). Cystic fibrosis is keyed as a deletion of one codon, not a frameshift.
- **U8.LT2** his Bacteria PowerPoint says heterotrophs take in "inorganic" molecules; the bank says organic. U8.LT1-P020 tells correct from incorrect only by italic type.
- **U8.LT5** alternation of generations and flower parts are left out (not in his plant materials).
- **U2.LT1** P005 (CHNOPS fill-in) and P006 (which elements are among the six) test the same fact in the easy band; if both land in one deal, the first one's explanation answers the second. Kept both; Jon may want one rewritten.
- **U8.LT3** P037 and the reading's worked example 2 say cilia give smooth, straight movement and a flagellum a zig-zag: common classroom wording, but debatable.
- **U8.LT4** morels are "hard to farm", not "cannot be cultivated" as his slide says (commercial morel farming now exists).
- Slides to fix on his side: the Bacteria PowerPoint "inorganic" line and the mutation lab's "nonsense or silent", and the Fungi slide's "morels cannot be cultivated".

## Checks before the first push

The PS lesson stands: a preview build applies packs to the live database, so nothing is pushed until checked.

1. Each builder ran `scripts/check-pack.ts` (0 errors, 50 rows, 15/20/15, every hint and explanation) and re-answered every row cold.
2. An independent review per pack: a key auditor answered all 50 rows before looking at the key (recomputing every numeric answer, rebuilding every cross and sequence), and a separate quality auditor looked for hint and cross-question give-aways, test-wiseness tells, wrong difficulty labels, and errors in the reading.
3. A fixer verified each finding against the file (rejecting any that would swap one of Jon's conventions for a textbook alternative), applied the real ones, and re-ran check-pack; then a fresh verifier re-answered every changed row cold.
