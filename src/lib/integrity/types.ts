export type IntegrityCapability = 'audit' | 'memory' | 'persistentCapabilities' | 'skills'
export type IntegrityFindingScope = 'audit' | 'keys' | 'killSwitch' | 'memory' | 'skills'

export type IntegrityFinding = {
	blockingCapabilities: IntegrityCapability[]
	message: string
	scope: IntegrityFindingScope
}

export type IntegrityStatus = {
	capabilities: {
		auditTrusted: boolean
		memoryTrusted: boolean
		persistentCapabilitiesTrusted: boolean
		skillsTrusted: boolean
	}
	findings: IntegrityFinding[]
	killSwitchActive: boolean
}

export type MemoryIntegrityState = 'invalid' | 'stale' | 'tampered' | 'unsigned' | 'untrusted-signer' | 'valid'
