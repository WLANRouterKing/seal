import {useState, useEffect, useCallback} from 'react'
import {useTranslation} from 'react-i18next'
import {
    Center,
    Stack,
    Text,
    ThemeIcon,
    PasswordInput,
    Button,
    Alert,
    Divider,
} from '@mantine/core'
import {IconLock, IconAlertTriangle, IconClock, IconFingerprint, IconFaceId} from '@tabler/icons-react'
import {useAuthStore} from '../stores/authStore'
import {truncateKey} from '../utils/format'
import {formatRemainingTime} from '../services/rateLimiter'

export default function LockScreen() {
    const {t} = useTranslation()
    const [password, setPassword] = useState('')
    const {
        unlock,
        unlockWithBiometrics,
        publicInfo,
        isLoading,
        error,
        clearError,
        lockoutUntil,
        failedAttempts,
        refreshLockoutStatus,
        checkBiometrics,
        biometricsEnabled,
        biometricType
    } = useAuthStore()

    // State for remaining lockout time - initialized lazily (impure functions allowed in initializers)
    const [remainingTime, setRemainingTime] = useState<number>(() => {
        if (!lockoutUntil) return 0
        return Math.max(0, lockoutUntil - Date.now())
    })

    const isLockedOut = remainingTime > 0

    // Check lockout status and biometrics on mount
    useEffect(() => {
        refreshLockoutStatus()
        checkBiometrics()
    }, [refreshLockoutStatus, checkBiometrics])

    const handleBiometricUnlock = useCallback(async () => {
        if (!isLoading && !isLockedOut) {
            clearError()
            await unlockWithBiometrics()
        }
    }, [isLoading, isLockedOut, clearError, unlockWithBiometrics])

    const BiometricIcon = biometricType === 'face' ? IconFaceId : IconFingerprint

    // Countdown timer for lockout - sync and update remaining time
    useEffect(() => {
        // Sync remaining time when lockoutUntil changes
        if (!lockoutUntil) {
            // Schedule state update to avoid synchronous setState in effect
            const timeout = setTimeout(() => setRemainingTime(0), 0)
            return () => clearTimeout(timeout)
        }

        // Calculate and set initial remaining time
        const updateRemaining = () => {
            const remaining = lockoutUntil - Date.now()
            if (remaining <= 0) {
                setRemainingTime(0)
                refreshLockoutStatus()
            } else {
                setRemainingTime(remaining)
            }
        }

        // Initial update via timeout to avoid synchronous setState
        const initialTimeout = setTimeout(updateRemaining, 0)
        const interval = setInterval(updateRemaining, 1000)

        return () => {
            clearTimeout(initialTimeout)
            clearInterval(interval)
        }
    }, [lockoutUntil, refreshLockoutStatus])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        clearError()
        if (password.trim() && !isLockedOut) {
            await unlock(password)
            setPassword('')
        }
    }

    return (
        <Center h="100vh" p="md">
            <Stack align="center" gap="lg" maw={320} w="100%">
                <ThemeIcon size={80} radius="xl" variant="light" color="cyan">
                    <IconLock size={40}/>
                </ThemeIcon>

                <Text size="xl" fw={700}>{t('lockScreen.title')}</Text>

                {publicInfo && (
                    <Text c="dimmed" size="sm">
                        {truncateKey(publicInfo.npub, 12)}
                    </Text>
                )}

                <form onSubmit={handleSubmit} style={{width: '100%'}}>
                    <Stack gap="md">
                        <PasswordInput
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('lockScreen.placeholder')}
                            autoFocus
                            autoComplete="current-password"
                            size="lg"
                            disabled={isLockedOut}
                            styles={{input: {textAlign: 'center'}}}
                        />

                        {isLockedOut && (
                            <Alert color="orange" icon={<IconClock size={16}/>}>
                                {t('lockScreen.lockedOut', { time: formatRemainingTime(remainingTime) })}
                            </Alert>
                        )}

                        {error && !isLockedOut && (
                            <Alert color="red" icon={<IconAlertTriangle size={16}/>}>
                                {error}
                                {failedAttempts > 0 && failedAttempts < 3 && (
                                    <Text size="xs" mt={4}>
                                        {t('lockScreen.attemptsRemaining', { count: 3 - failedAttempts })}
                                    </Text>
                                )}
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            size="lg"
                            color="cyan"
                            fullWidth
                            disabled={!password.trim() || isLockedOut}
                            loading={isLoading && !biometricsEnabled}
                        >
                            {isLockedOut
                                ? formatRemainingTime(remainingTime)
                                : t('lockScreen.unlock')
                            }
                        </Button>

                        {biometricsEnabled && (
                            <>
                                <Divider label={t('common.or', 'or')} labelPosition="center" />
                                <Button
                                    variant="light"
                                    size="lg"
                                    color="cyan"
                                    fullWidth
                                    disabled={isLockedOut}
                                    loading={isLoading}
                                    onClick={handleBiometricUnlock}
                                    leftSection={<BiometricIcon size={24} />}
                                >
                                    {biometricType === 'face'
                                        ? t('lockScreen.unlockWithFace', 'Unlock with Face')
                                        : biometricType === 'webauthn'
                                            ? t('lockScreen.unlockWithPasskey', 'Unlock with Passkey')
                                            : t('lockScreen.unlockWithFingerprint', 'Unlock with Fingerprint')
                                    }
                                </Button>
                            </>
                        )}
                    </Stack>
                </form>
            </Stack>
        </Center>
    )
}
