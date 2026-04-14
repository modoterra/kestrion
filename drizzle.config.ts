import { join } from 'node:path'

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.KESTRION_DB_FILE ?? join(process.env.HOME ?? process.cwd(), '.share', 'kestrion', 'kestrion.sqlite')
	},
	out: './src/db/migrations',
	schema: './src/db/schema.ts'
})
