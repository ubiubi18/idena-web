import {
  CloseButton,
  Flex,
  Link,
  TabList,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react'
import {useRouter} from 'next/router'
import {Trans, useTranslation} from 'react-i18next'
import {Page, PageTitle} from '../../screens/app/components'
import {
  GetInvitationTab,
  GetInvitationTabPanel,
  GetInvitationTabTitle,
} from '../../screens/home/components'
import {
  DiscordIcon,
  DiscordInvertedIcon,
  RedditIcon,
  RedditInvertedIcon,
  TelegramIcon,
  TelegramInvertedIcon,
} from '../../shared/components/icons'
import Layout from '../../shared/components/layout'

export default function GetInvitation() {
  const router = useRouter()
  const {t} = useTranslation()

  return (
    <Layout showHamburger={false}>
      <Page>
        <Flex
          align="center"
          alignSelf="stretch"
          justify={['center', 'space-between']}
          mb={[8, 2]}
          w={['100%', null]}
        >
          <PageTitle
            fontSize={['base', 'xl']}
            fontWeight={['bold', 500]}
            mb={0}
          >
            {t('How to get an invitation')}
          </PageTitle>
          <CloseButton
            color={['blue.500', 'inherit']}
            size="lg"
            position={['absolute', 'inherit']}
            right={2}
            onClick={() => router.push('/home')}
          />
        </Flex>
        <Flex
          direction="column"
          maxW="480px"
          w={['100%', null]}
          fontSize={['mdx', 'md']}
        >
          <Text>
            {t(
              'To minimize the probability of a Sybil attack, the pace of network growth is restricted: Idena network participation is invitation-based. New invitations can be sent out only by validated users. The number of invitations is limited and increases as the network grows.',
              {nsSeparator: '|'}
            )}
          </Text>
          <Text mt={2}>
            {t(
              'Please choose the platform where you have the most active account:',
              {nsSeparator: '|'}
            )}
          </Text>

          <Tabs variant="unstyled" mt={8}>
            <TabList bg={['gray.50', 'white']} p={[1, 0]} borderRadius="md">
              <GetInvitationTab
                iconSelected={<TelegramInvertedIcon />}
                icon={<TelegramIcon />}
                title="Telegram"
              />
              <GetInvitationTab
                iconSelected={<DiscordInvertedIcon />}
                icon={<DiscordIcon />}
                title="Discord"
              />
              <GetInvitationTab
                iconSelected={<RedditInvertedIcon />}
                icon={<RedditIcon />}
                title="Reddit"
              />
            </TabList>
            <TabPanels>
              <GetInvitationTabPanel>
                <GetInvitationTabTitle>Telegram</GetInvitationTabTitle>
                <Text>
                  <Trans t={t} i18nKey="joinIdenaTelegram">
                    Join the official{' '}
                    <Link
                      href="https://t.me/IdenaNetworkPublic"
                      target="_blank"
                      color="blue.500"
                    >
                      Idena Telegram group
                    </Link>{' '}
                    and request an invitation code from the community.
                  </Trans>
                </Text>
              </GetInvitationTabPanel>
              <GetInvitationTabPanel>
                <GetInvitationTabTitle>Discord</GetInvitationTabTitle>
                <Text>
                  <Trans t={t} i18nKey="joinIdenaDiscord">
                    Join{' '}
                    <Link
                      href="https://discord.gg/idena-community-634481767352369162"
                      target="_blank"
                      color="blue.500"
                    >
                      Idena Community Discord
                    </Link>{' '}
                    and request an invitation code from the community in
                    #invite-requests channel.
                  </Trans>
                </Text>
              </GetInvitationTabPanel>
              <GetInvitationTabPanel>
                <GetInvitationTabTitle>Reddit</GetInvitationTabTitle>
                <Text color="gray.500">
                  <Trans t={t} i18nKey="joinIdenaReddit">
                    Join{' '}
                    <Link
                      href="https://www.reddit.com/r/Idena/"
                      target="_blank"
                      color="blue.500"
                    >
                      Idena subreddit
                    </Link>{' '}
                    and request an invitation code from the community.
                  </Trans>
                </Text>
              </GetInvitationTabPanel>
            </TabPanels>
          </Tabs>
        </Flex>
      </Page>
    </Layout>
  )
}
