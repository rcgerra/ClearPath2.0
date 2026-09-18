import { userService } from '../services/userService';

/**
 * Temporary People.csv loader.
 * Future migration: replace CSV identity ingestion with Microsoft Entra ID sync.
 */
const filePath = process.argv[2] ?? process.env.PEOPLE_CSV_PATH;

if (!filePath) {
  console.error('Usage: npm run import:users -- <path-to-people.csv>');
  process.exit(1);
}

userService
  .importPeopleCsv(filePath)
  .then((result) => {
    console.log('Temporary user import complete:', result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Temporary user import failed:', error);
    process.exit(1);
  });