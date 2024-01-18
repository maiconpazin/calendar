"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signOut, useSession } from "next-auth/react";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { getLayout } from "@calcom/features/MainLayout";
import SectionBottomActions from "@calcom/features/settings/SectionBottomActions";
// import { getLayout } from "@calcom/features/settings/layouts/SettingsLayout";
import { APP_NAME, FULL_NAME_LENGTH_MAX_LIMIT } from "@calcom/lib/constants";
import { getUserAvatarUrl } from "@calcom/lib/getAvatarUrl";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { md } from "@calcom/lib/markdownIt";
import turndown from "@calcom/lib/turndownService";
import { trpc } from "@calcom/trpc/react";
import type { RouterOutputs } from "@calcom/trpc/react";
import type { Ensure } from "@calcom/types/utils";
import {
  Button,
  Editor,
  Form,
  ImageUploader,
  Label,
  Meta,
  showToast,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonContainer,
  SkeletonText,
  TextField,
} from "@calcom/ui";
import { UserAvatar } from "@calcom/ui";

import PageWrapper from "@components/PageWrapper";
import { UsernameAvailabilityField } from "@components/ui/UsernameAvailability";

const SkeletonLoader = ({ title, description }: { title: string; description: string }) => {
  return (
    <SkeletonContainer>
      <Meta title={title} description={description} borderInShellHeader={true} />
      <div className="border-subtle space-y-6 rounded-b-lg border border-t-0 px-4 py-8">
        <div className="flex items-center">
          <SkeletonAvatar className="me-4 mt-0 h-16 w-16 px-4" />
          <SkeletonButton className="h-6 w-32 rounded-md p-5" />
        </div>
        <SkeletonText className="h-8 w-full" />
        <SkeletonText className="h-8 w-full" />
        <SkeletonText className="h-8 w-full" />

        <SkeletonButton className="mr-6 h-8 w-20 rounded-md p-5" />
      </div>
    </SkeletonContainer>
  );
};

type FormValues = {
  username: string;
  avatar: string;
  name: string;
  email: string;
  bio: string;
};

const ProfileView = () => {
  const { t } = useLocale();
  const utils = trpc.useContext();
  const { update } = useSession();
  const { data: user, isLoading } = trpc.viewer.me.useQuery();

  const { data: avatarData } = trpc.viewer.avatar.useQuery(undefined, {
    enabled: !isLoading && !user?.avatarUrl,
  });

  const updateProfileMutation = trpc.viewer.updateProfile.useMutation({
    onSuccess: async (res) => {
      await update(res);
      showToast(t("settings_updated_successfully"), "success");

      // signout user only in case of password reset
      if (res.signOutUser && tempFormValues && res.passwordReset) {
        showToast(t("password_reset_email", { email: tempFormValues.email }), "success");
        await signOut({ callbackUrl: "/auth/logout?passReset=true" });
      } else {
        utils.viewer.me.invalidate();
        utils.viewer.avatar.invalidate();
        utils.viewer.shouldVerifyEmail.invalidate();
      }
      setTempFormValues(null);
    },
    onError: (e) => {
      switch (e.message) {
        // TODO: Add error codes.
        case "email_already_used":
          {
            showToast(t(e.message), "error");
          }
          return;
        default:
          showToast(t("error_updating_settings"), "error");
      }
    },
  });

  const [tempFormValues, setTempFormValues] = useState<FormValues | null>(null);

  if (isLoading || !user) {
    return (
      <SkeletonLoader title={t("profile")} description={t("profile_description", { appName: APP_NAME })} />
    );
  }

  const defaultValues = {
    username: user.username || "",
    avatar: getUserAvatarUrl(user),
    name: user.name || "",
    email: user.email || "",
    bio: user.bio || "",
  };

  return (
    <>
      <Meta
        title={t("profile")}
        description={t("profile_description", { appName: APP_NAME })}
        borderInShellHeader={true}
      />
      <ProfileForm
        key={JSON.stringify(defaultValues)}
        defaultValues={defaultValues}
        isLoading={updateProfileMutation.isLoading}
        isFallbackImg={!user.avatarUrl && !avatarData?.avatar}
        user={user}
        userOrganization={user.organization}
        onSubmit={(values) => {
          updateProfileMutation.mutate(values);
        }}
        extraField={
          <div className="mt-6">
            <UsernameAvailabilityField
              onSuccessMutation={async () => {
                showToast(t("settings_updated_successfully"), "success");
                await utils.viewer.me.invalidate();
              }}
              onErrorMutation={() => {
                showToast(t("error_updating_settings"), "error");
              }}
            />
          </div>
        }
      />
    </>
  );
};

const ProfileForm = ({
  defaultValues,
  onSubmit,
  extraField,
  isLoading = false,
  isFallbackImg,
  user,
  userOrganization,
}: {
  defaultValues: FormValues;
  onSubmit: (values: FormValues) => void;
  extraField?: React.ReactNode;
  isLoading: boolean;
  isFallbackImg: boolean;
  user: RouterOutputs["viewer"]["me"];
  userOrganization: RouterOutputs["viewer"]["me"]["organization"];
}) => {
  const { t } = useLocale();
  const [firstRender, setFirstRender] = useState(true);

  const profileFormSchema = z.object({
    username: z.string(),
    avatar: z.string(),
    name: z
      .string()
      .trim()
      .min(1, t("you_need_to_add_a_name"))
      .max(FULL_NAME_LENGTH_MAX_LIMIT, {
        message: t("max_limit_allowed_hint", { limit: FULL_NAME_LENGTH_MAX_LIMIT }),
      }),
    email: z.string().email(),
    bio: z.string(),
  });

  const formMethods = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(profileFormSchema),
  });

  const {
    formState: { isSubmitting, isDirty },
  } = formMethods;

  const isDisabled = isSubmitting || !isDirty;
  return (
    <Form form={formMethods} handleSubmit={onSubmit}>
      <div className="border-subtle border-x px-4 pb-10 pt-8 sm:px-6">
        <div className="flex items-center">
          <Controller
            control={formMethods.control}
            name="avatar"
            render={({ field: { value } }) => {
              const showRemoveAvatarButton = value === null ? false : !isFallbackImg;
              const organization =
                userOrganization && userOrganization.id
                  ? {
                      ...(userOrganization as Ensure<typeof user.organization, "id">),
                      slug: userOrganization.slug || null,
                      requestedSlug: userOrganization.metadata?.requestedSlug || null,
                    }
                  : null;
              return (
                <>
                  <UserAvatar
                    data-testid="profile-upload-avatar"
                    previewSrc={value}
                    size="lg"
                    user={user}
                    organization={organization}
                  />
                  <div className="ms-4">
                    <h2 className="mb-2 text-sm font-medium">{t("profile_picture")}</h2>
                    <div className="flex gap-2">
                      <ImageUploader
                        target="avatar"
                        id="avatar-upload"
                        buttonMsg={t("upload_avatar")}
                        handleAvatarChange={(newAvatar) => {
                          formMethods.setValue("avatar", newAvatar, { shouldDirty: true });
                        }}
                        imageSrc={value}
                        triggerButtonColor={showRemoveAvatarButton ? "secondary" : "primary"}
                      />

                      {showRemoveAvatarButton && (
                        <Button
                          color="secondary"
                          onClick={() => {
                            formMethods.setValue("avatar", "", { shouldDirty: true });
                          }}>
                          {t("remove")}
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              );
            }}
          />
        </div>
        {extraField}
        <div className="mt-6">
          <TextField label={t("full_name")} {...formMethods.register("name")} />
        </div>
        <div className="mt-6">
          <TextField label={t("email")} hint={t("change_email_hint")} {...formMethods.register("email")} />
        </div>
        <div className="mt-6">
          <Label>{t("about")}</Label>
          <Editor
            getText={() => md.render(formMethods.getValues("bio") || "")}
            setText={(value: string) => {
              formMethods.setValue("bio", turndown(value), { shouldDirty: true });
            }}
            excludedToolbarItems={["blockType"]}
            disableLists
            firstRender={firstRender}
            setFirstRender={setFirstRender}
          />
        </div>
      </div>
      <SectionBottomActions align="end">
        <Button loading={isLoading} disabled={isDisabled} color="primary" type="submit">
          {t("update")}
        </Button>
      </SectionBottomActions>
    </Form>
  );
};

ProfileView.getLayout = getLayout;
ProfileView.PageWrapper = PageWrapper;

export default ProfileView;
