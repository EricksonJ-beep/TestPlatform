/**
 * Jon's Biology A / Biology B course structure (Sept 2026). Codes are unique per
 * course, so each target is coded by unit: Unit 2's LT3 is `U2.LT3`. The title is
 * the short label for lists and chips; the description is the exact "I can" statement.
 */
import type { CourseDefinition } from "../seed-courses";

const lt = (code: string, title: string, description: string) => ({ code, title, description });

export const courses: CourseDefinition[] = [
  {
    name: "Biology A",
    description: "First semester: science skills, biochemistry, cells, and cell energy.",
    units: [
      {
        name: "Unit 1 · The Science of Biology",
        targets: [
          lt(
            "U1.LT1",
            "Design a controlled experiment",
            "I can design a scientific experiment that includes a control group, experimental group, constants, independent variable and dependent variable."
          ),
          lt(
            "U1.LT2",
            "Living vs. non-living",
            "I can compare and contrast the properties of living organisms (biotic) with non-living (abiotic) entities, providing specific examples for each of the characteristics of life."
          ),
          lt(
            "U1.LT3",
            "Use a microscope",
            "I can properly use a microscope and identify the parts."
          ),
          lt(
            "U1.LT4",
            "Communicate experimental data",
            "I can communicate data and information from a scientific experiment in a concise way."
          ),
        ],
      },
      {
        name: "Unit 2 · Biochemistry",
        targets: [
          lt(
            "U2.LT1",
            "Atoms, molecules, and bonds",
            "I can describe atoms, elements, molecules, compounds, and types of chemical bonds."
          ),
          lt(
            "U2.LT2",
            "Water's structure and properties",
            "I can explain how water's structure gives it unique properties that support life."
          ),
          lt(
            "U2.LT3",
            "pH, acids, and bases",
            "I can define pH and describe how acids and bases affect living things."
          ),
          lt(
            "U2.LT4",
            "The four macromolecules",
            "I can compare the structure and function of the four macromolecules: carbohydrates, proteins, lipids, and nucleic acids."
          ),
          lt(
            "U2.LT5",
            "Enzymes",
            "I can explain how enzymes work and why they are important in the human body."
          ),
        ],
      },
      {
        name: "Unit 3 · Cell Structure and Function",
        targets: [
          lt("U3.LT1", "Cell theory", "I can explain the components of the modern cell theory."),
          lt(
            "U3.LT2",
            "Prokaryotic vs. eukaryotic cells",
            "I can compare and contrast prokaryotic and eukaryotic cells."
          ),
          lt(
            "U3.LT3",
            "Model of cell structure",
            "I can create a model that shows understanding of basic cell structure."
          ),
          lt(
            "U3.LT4",
            "Cellular transport",
            "I can classify and describe the forms of cellular transport."
          ),
        ],
      },
      {
        name: "Unit 4 · Cell Energy",
        targets: [
          lt(
            "U4.LT1",
            "Cellular respiration",
            "I can explain what cellular respiration is including reactants and products."
          ),
          lt(
            "U4.LT2",
            "Aerobic vs. anaerobic respiration",
            "I can compare and contrast aerobic and anaerobic respiration."
          ),
          lt("U4.LT3", "Photosynthesis", "I can describe the process of photosynthesis."),
          lt(
            "U4.LT4",
            "Investigate factors affecting photosynthesis",
            "I can design an experiment to investigate how factors affect photosynthesis."
          ),
        ],
      },
    ],
  },
  {
    name: "Biology B",
    description: "Second semester: cell division, genetics, DNA and protein synthesis, kingdoms.",
    units: [
      {
        name: "Unit 5 · Cell Growth & Division",
        targets: [
          lt(
            "U5.LT1",
            "Mitosis",
            "I can model mitosis and discuss its importance in cell growth and development."
          ),
          lt(
            "U5.LT2",
            "Meiosis",
            "I can model meiosis and discuss its importance in sexual reproduction."
          ),
          lt(
            "U5.LT3",
            "Karyotypes and inheritance",
            "I can design a karyotype to demonstrate inheritance patterns."
          ),
          lt(
            "U5.LT4",
            "Cancer and cell division",
            "I can define cancer and the relationship to cell division."
          ),
        ],
      },
      {
        name: "Unit 6 · Genetics & Human Heredity",
        targets: [
          lt(
            "U6.LT1",
            "Punnett squares",
            "I can create Punnett squares that illustrate how genotypes and phenotypes are related."
          ),
          lt(
            "U6.LT2",
            "Complex inheritance",
            "I can identify complex patterns of inheritance and predict the outcome of complex inheritance crosses."
          ),
          lt(
            "U6.LT3",
            "Pedigrees",
            "I can use a pedigree to demonstrate the patterns of inheritance human traits follow."
          ),
        ],
      },
      {
        name: "Unit 7 · DNA, RNA and Protein Synthesis",
        targets: [
          lt(
            "U7.LT1",
            "DNA structure",
            "I can describe the structure of DNA and the double helix model."
          ),
          lt(
            "U7.LT2",
            "DNA replication",
            "I can model and explain the process of DNA replication."
          ),
          lt("U7.LT3", "Protein synthesis", "I can illustrate how proteins are synthesized."),
          lt("U7.LT4", "Mutations", "I can predict the effects of mutations on DNA."),
        ],
      },
      {
        name: "Unit 8 · Kingdoms",
        targets: [
          lt(
            "U8.LT1",
            "Taxonomy",
            "I can define taxonomy and understand how it is used in biology."
          ),
          lt(
            "U8.LT2",
            "Bacteria",
            "I can understand the different types of bacteria and the beneficial and harmful roles bacteria play in the environment and in human health."
          ),
          lt(
            "U8.LT3",
            "Kingdom Protista",
            "I can give a general description of the organisms in the Kingdom Protista."
          ),
          lt(
            "U8.LT4",
            "Kingdom Fungi",
            "I can give a general description of the organisms in the Kingdom Fungi."
          ),
          lt(
            "U8.LT5",
            "Kingdom Plantae",
            "I can give a general description of the organisms in the Kingdom Plantae."
          ),
        ],
      },
    ],
  },
];
