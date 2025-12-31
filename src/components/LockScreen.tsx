import {useState, useEffect} from 'react'
import {useTranslation} from 'react-i18next'
import {
    Center,
    Stack,
    Text,
    ThemeIcon,
    PasswordInput,
    Button,
    Alert,
} from '@mantine/core'
import {IconLock, IconAlertTriangle, IconClock} from '@tabler/icons-react'
import {useAuthStore} from '../stores/authStore'
import {truncateKey} from '../utils/format'
import {formatRemainingTime} from '../services/rateLimiter'

export default function LockScreen() {
    const {t} = useTranslation()
    const [password, setPassword] = useState('')
    const {unlock, publicInfo, isLoading, error, clearError, lockoutUntil, failedAttempts, refreshLockoutStatus} = useAuthStore()
    const [remainingTime, setRemainingTime] = useState<number>(0)

    // Check lockout status on mount
    useEffect(() => {
        refreshLockoutStatus()
    }, [refreshLockoutStatus])

    // Countdown timer for lockout
    useEffect(() => {
        if (!lockoutUntil) {
            setRemainingTime(0)
            return
        }

        const updateRemaining = () => {
            const remaining = lockoutUntil - Date.now()
            if (remaining <= 0) {
                setRemainingTime(0)
                refreshLockoutStatus()
            } else {
                setRemainingTime(remaining)
            }
        }

        updateRemaining()
        const interval = setInterval(updateRemaining, 1000)
        return () => clearInterval(interval)
    }, [lockoutUntil, refreshLockoutStatus])

    const isLockedOut = remainingTime > 0

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
                            loading={isLoading}
                        >
                            {isLockedOut
                                ? formatRemainingTime(remainingTime)
                                : t('lockScreen.unlock')
                            }
                        </Button>
                    </Stack>
                </form>
            </Stack>
        </Center>
    )
}
