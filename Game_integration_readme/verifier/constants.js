'use strict'

// The per-engine constants file (BolyAchievements.cs, …) built from a
// boly/achievements.json, so game code refers to achievements by a checked
// name instead of a string a typo would silently break. Same output as the
// "Download constants" button on boly.cl (ffstudios-shop
// src/utils/achievementConstants.ts), only the header says where it came from.

const ENGINES = ['unity', 'godot', 'unreal', 'gamemaker']

// One line, no comment terminators: names are developer-typed text.
const commentText = (text) => String(text).replace(/[\r\n\t]+/g, ' ').replace(/\*\//g, '* /').trim()

const describe = (a) => {
  const name = a.name.es || a.name.en
  return commentText(a.target > 1 ? `${name} (meta: ${a.target})` : name)
}

function achievementConstantsFile(engine, achievements) {
  const header = 'Generado por boly-verify desde boly/achievements.json. No lo edites: si cambias los logros, vuelve a generarlo.'
  switch (engine) {
    case 'unity':
      return {
        fileName: 'BolyAchievements.cs',
        content: [
          `// ${header}`,
          'namespace Boly',
          '{',
          '    public static class BolyAchievements',
          '    {',
          ...achievements.flatMap((a) => [
            `        /// <summary>${describe(a).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</summary>`,
            `        public const string ${a.api_name} = "${a.api_name}";`,
          ]),
          '    }',
          '}',
          '',
        ].join('\n'),
      }
    case 'godot':
      return {
        fileName: 'boly_achievements.gd',
        content: [
          `# ${header}`,
          'class_name BolyAchievements',
          'extends RefCounted',
          '',
          ...achievements.flatMap((a) => [`## ${describe(a)}`, `const ${a.api_name} := "${a.api_name}"`]),
          '',
        ].join('\n'),
      }
    case 'unreal':
      return {
        fileName: 'BolyAchievements.h',
        content: [
          `// ${header}`,
          '#pragma once',
          '',
          '#include "CoreMinimal.h"',
          '',
          'namespace BolyAchievements',
          '{',
          ...achievements.flatMap((a) => [`\t// ${describe(a)}`, `\tinline constexpr const TCHAR* ${a.api_name} = TEXT("${a.api_name}");`]),
          '}',
          '',
        ].join('\n'),
      }
    case 'gamemaker':
      return {
        fileName: 'boly_achievements.gml',
        content: [
          `// ${header}`,
          '// Pega este codigo en un Script llamado boly_achievements.',
          '',
          ...achievements.flatMap((a) => [`// ${describe(a)}`, `#macro BOLY_ACH_${a.api_name} "${a.api_name}"`]),
          '',
        ].join('\n'),
      }
  }
  throw new Error(`Unknown engine "${engine}" (use ${ENGINES.join(', ')})`)
}

module.exports = { ENGINES, achievementConstantsFile }
