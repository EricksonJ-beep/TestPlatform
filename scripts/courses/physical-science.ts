/**
 * Jon's Physical Science A / B course structure (Sept 2026), from the LT sheet.
 * Targets are the formative "I can" statements (the ones questions get tagged to);
 * codes are per unit (`U3.LT2`). Titles are short labels for chips and lists.
 */
import type { CourseDefinition } from "../seed-courses";

const lt = (code: string, title: string, description: string) => ({ code, title, description });

export const courses: CourseDefinition[] = [
  {
    name: "Physical Science A",
    description: "First semester: science skills, atomic structure, and bonding.",
    units: [
      {
        name: "Unit 1 · Introduction to Physical Science",
        targets: [
          lt(
            "U1.LT1",
            "Lab equipment and the scientific method",
            "I can use lab equipment correctly and use the scientific method."
          ),
          lt(
            "U1.LT2",
            "Accuracy, precision, and units",
            "I can measure accurately and precisely, using the appropriate units, significant figures, averages, and percent error to show how accurate data is."
          ),
          lt(
            "U1.LT3",
            "Unit conversions and scientific notation",
            "I can convert numbers into different units (dimensional analysis) and use scientific notation."
          ),
          lt(
            "U1.LT4",
            "Classifying matter and density",
            "I can sort matter into groups (elements, compounds, mixtures), identify physical changes from chemical changes, and use density to figure out what a substance is."
          ),
        ],
      },
      {
        name: "Unit 2 · Atomic Structure",
        targets: [
          lt(
            "U2.LT1",
            "History of the atomic model",
            "I can create a timeline showing the major scientists, their dates, and how each one changed the atomic model."
          ),
          lt(
            "U2.LT2",
            "Parts of an atom",
            "I can describe the parts of an atom and use the periodic table to figure out what any element is made of."
          ),
          lt(
            "U2.LT3",
            "Isotopes and isotope notation",
            "I can explain what isotopes are and use isotope notation to describe them."
          ),
          lt(
            "U2.LT4",
            "Periodic table trends",
            "I can use an element's location on the periodic table to predict its structure and its properties."
          ),
        ],
      },
      {
        name: "Unit 3 · Bonding",
        targets: [
          lt(
            "U3.LT1",
            "Reading chemical formulas",
            "I can read a chemical formula and tell what elements are in a compound and how many atoms of each."
          ),
          lt(
            "U3.LT2",
            "Ionic vs. covalent compounds",
            "I can look at a compound and tell whether it's ionic or covalent."
          ),
          lt(
            "U3.LT3",
            "Name to formula",
            "I can take the name of a compound and write its chemical formula — ionic or covalent, including polyatomic ions and transition metals."
          ),
          lt(
            "U3.LT4",
            "Formula to name",
            "I can take the chemical formula of a compound and write its name — ionic or covalent, including polyatomic ions and transition metals."
          ),
        ],
      },
    ],
  },
  {
    name: "Physical Science B",
    description: "Second semester: motion, forces, work and efficiency.",
    units: [
      {
        name: "Unit 4 · Motion",
        targets: [
          lt(
            "U4.LT1",
            "Distance, time, and speed",
            "I can define and calculate distance, time, and speed."
          ),
          lt(
            "U4.LT2",
            "Velocity, momentum, and acceleration",
            "I can identify and calculate velocity, momentum, and acceleration."
          ),
          lt("U4.LT3", "Calculating acceleration", "I can identify and calculate acceleration."),
          lt(
            "U4.LT4",
            "Motion graphs",
            "I can construct and interpret graphs illustrating distance, velocity, and acceleration."
          ),
        ],
      },
      {
        name: "Unit 5 · Forces",
        targets: [
          lt("U5.LT1", "Identifying forces", "I can identify forces acting on an object."),
          lt("U5.LT2", "Free-body diagrams", "I can calculate forces acting on an object (FBD)."),
          lt(
            "U5.LT3",
            "Newton's 1st and 2nd Laws",
            "I can calculate and explain Newton's 1st Law and Newton's 2nd Law."
          ),
          lt("U5.LT4", "Newton's 3rd Law", "I can calculate and explain Newton's 3rd Law."),
        ],
      },
      {
        name: "Unit 6 · Work and Efficiency",
        targets: [
          lt("U6.LT1", "Calculating work", "I can calculate work."),
          lt(
            "U6.LT2",
            "Levers",
            "I can identify and calculate the MA and efficiency of the three different classes of levers."
          ),
          lt(
            "U6.LT3",
            "Inclined planes",
            "I can identify and calculate the MA and efficiency of an inclined plane."
          ),
          lt(
            "U6.LT4",
            "Pulleys",
            "I can identify and calculate the MA and efficiency of a pulley."
          ),
          lt(
            "U6.LT5",
            "Rube Goldberg machine",
            "I can design a Rube Goldberg Machine to demonstrate an understanding of energy flow within a system."
          ),
        ],
      },
    ],
  },
];
