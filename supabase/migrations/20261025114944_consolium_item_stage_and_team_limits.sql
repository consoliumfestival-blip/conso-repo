-- Target festival settings from the reviewed workbook. Item IDs are authoritative.
-- Run only after the team item stage and participant limit schema migration.
-- Existing registrations are retained, including entries above a new limit.
BEGIN;

CREATE TEMP TABLE _consolium_item_settings ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('06cc27c9-df18-4af4-8a55-2e6061341c6f'::uuid, 'PRIME-CB5174423', 'individual', 'offstage', 5),
  ('ea298656-550b-4790-aa20-66679a3733a0'::uuid, 'NOVA-CADA121D4', 'individual', 'offstage', 2),
  ('3d38d42b-0d0c-4533-b94f-634622e68b6b'::uuid, 'PRIME-C9DA14253', 'individual', 'stage', 2),
  ('ec05ff50-529c-4aa5-9c4b-9ba0249519eb'::uuid, 'ZENITH-CBA6D0AFE', 'individual', 'offstage', 2),
  ('841bd6f4-242a-491b-8d53-fd5e48ff1907'::uuid, 'ZENITH-C534DE8D2', 'group', 'stage', NULL),
  ('dc5b579e-d9eb-401b-a638-703c9b0dd82a'::uuid, 'GENERAL-CFE0B2AB5', 'group', 'stage', NULL),
  ('cbc55f90-e61c-4aa7-908d-2b28ba402ecf'::uuid, 'SPARK-C4F58702A', 'individual', 'offstage', 2),
  ('84278f21-7271-461f-9fe6-05b4d494090e'::uuid, 'PRIME-C626A659D', 'group', 'stage', NULL),
  ('a9c3e4d8-e584-4789-b17f-5fb1b886d7f0'::uuid, 'SPARK-CE9D2499E', 'group', 'stage', NULL),
  ('8418bcc2-7663-4d57-afee-eb1867d018f6'::uuid, 'ZENITH-C9D030685', 'individual', 'offstage', 1),
  ('d3107ca0-ce90-4a5a-a4f5-09ba2bf50842'::uuid, 'NOVA-C4B7ED2D8', 'individual', 'offstage', 2),
  ('542cde0a-0eb3-43f6-98ee-93427e27b0f3'::uuid, 'SPARK-C595B1DFD', 'individual', 'stage', 2),
  ('d35d12cb-fe58-400d-9d55-221803fdf69f'::uuid, 'GENERAL-CF7ADDCB1', 'group', 'offstage', NULL),
  ('e0c9ef5c-ce1a-4156-b4ff-5eb70bf905c6'::uuid, 'GENERAL-CC83F745B', 'individual', 'offstage', 2),
  ('105ff710-6445-4e95-98f4-de45d8d90bb7'::uuid, 'GENERAL-C7574EEA6', 'individual', 'offstage', 2),
  ('825cd3a2-fdf1-4daf-94d8-4a1bf4910cd8'::uuid, 'SPARK-C125C160F', 'individual', 'offstage', 5),
  ('c76a64ee-b570-45d0-9bab-fb8ff5e86a95'::uuid, 'GENERAL-CB364E47A', 'individual', 'offstage', 2),
  ('438b0516-5edd-425c-b663-71496883859f'::uuid, 'ZENITH-C39C926F4', 'individual', 'stage', 1),
  ('f2e7c9d0-47de-458a-8da7-948535d67e26'::uuid, 'GENERAL-CFBE2FC38', 'group', 'offstage', NULL),
  ('0945cdfa-da2c-49ef-8cf7-a41761c948e1'::uuid, 'GENERAL-C8907A3AF', 'group', 'stage', NULL),
  ('d4df6d18-ab93-4010-8e7a-a61a55ddb4b5'::uuid, 'GENERAL-C5CD70690', 'individual', 'offstage', 2),
  ('bbc319e5-e032-4643-ae24-a1071b90b3e2'::uuid, 'GENERAL-C576FDE41', 'individual', 'stage', 1),
  ('991a82f0-c5b6-429a-b9a8-09d70d12c3a5'::uuid, 'GENERAL-C374E73A8', 'individual', 'offstage', 8),
  ('ccec6c09-fbb8-4555-b25e-a22b1d5fa431'::uuid, 'GENERAL-C81E29900', 'group', 'offstage', NULL),
  ('56bed0fd-c2c8-484a-91e6-f632d6f7badc'::uuid, 'GENERAL-CAB8B47C8', 'group', 'stage', NULL),
  ('ed1c95b5-b42e-4903-8742-f38a8bffa242'::uuid, 'SPARK-CABA0A3BD', 'individual', 'offstage', NULL),
  ('82169635-c479-47d5-b63b-38650e3fc682'::uuid, 'SPARK-C33D9A76B', 'individual', 'offstage', NULL),
  ('cc5975e8-ba3b-4f84-8828-5c9a867ea84b'::uuid, 'GENERAL-C2BE15B5E', 'individual', 'offstage', 2),
  ('356fbbbf-4cb0-4a15-afe2-0d0aa8daa99b'::uuid, 'NOVA-C3D855849', 'individual', 'offstage', 3),
  ('51a45d88-46af-4041-9d88-4bf41c9a49a4'::uuid, 'SPARK-C0CB2B502', 'individual', 'offstage', 3),
  ('e5ea6de0-2eb4-456b-864d-ca571c456a30'::uuid, 'GENERAL-CA3897DA3', 'individual', 'offstage', 8),
  ('2f4f8dda-c4a9-422d-8443-2c37643ee983'::uuid, 'NOVA-C303581DD', 'individual', 'stage', 1),
  ('58ed1529-2b87-4d2e-8aea-d2f6b06c6dda'::uuid, 'NOVA-CFD5D060B', 'individual', 'offstage', 3),
  ('bad82be2-cc42-4425-bddc-987074f34ef2'::uuid, 'PRIME-C0E5AB01B', 'individual', 'offstage', 3),
  ('e7c1f006-9b30-4be8-a70f-a7b341d5906d'::uuid, 'SPARK-C24170481', 'individual', 'offstage', 3),
  ('a5bdebff-6532-4d09-aa48-9fccd62338e1'::uuid, 'ZENITH-CB28416B9', 'individual', 'offstage', 3),
  ('c693d03e-1cbf-423f-9278-f37c2a4bbd9c'::uuid, 'PRIME-CB74A606F', 'individual', 'stage', 1),
  ('bbf7e5ff-1897-408d-90ce-ccbef2bdef8e'::uuid, 'NOVA-C40838339', 'individual', 'stage', 3),
  ('678722ce-e9e2-459a-a827-fdaef1799c22'::uuid, 'GENERAL-C613183A6', 'individual', 'offstage', 5),
  ('11b5a851-53d9-4e29-a561-cdf728a37950'::uuid, 'PRIME-C0D03757C', 'group', 'offstage', NULL),
  ('97fb004f-b1a4-49f6-bed5-4f928d3e0546'::uuid, 'GENERAL-CA494C3E6', 'group', 'offstage', NULL),
  ('af8d5250-d74f-4ef1-953e-71078fa73ee5'::uuid, 'GENERAL-C4E3DBDB9', 'group', 'offstage', NULL),
  ('f9a0d1c5-c82f-4c60-9ccd-b6210cf61d73'::uuid, 'NOVA-CC5996829', 'individual', 'offstage', 5),
  ('0c30844c-1cc3-4a77-b168-486787d12c19'::uuid, 'PRIME-C5144D23A', 'individual', 'offstage', 5),
  ('21a68f6f-fe39-49f4-a233-182e4df950bb'::uuid, 'SPARK-C5B3B587F', 'individual', 'offstage', 5),
  ('c4c82ae1-4c86-4715-9604-a1b4c3a3e133'::uuid, 'ZENITH-CBAA36F83', 'individual', 'offstage', 4),
  ('827fd0be-646a-49e2-ac90-36e957fd5f23'::uuid, 'NOVA-CBD8B9830', 'individual', 'offstage', 5),
  ('6f066af7-80cb-4c7e-a99e-bc65fc723d04'::uuid, 'PRIME-CFE692D79', 'individual', 'offstage', 5),
  ('58002bdb-d6eb-4be4-bfb7-7b12a01a855a'::uuid, 'SPARK-CBF20E1D3', 'individual', 'offstage', 5),
  ('7941eb2a-4653-4961-b4c5-bb85eda961fc'::uuid, 'ZENITH-CF7FA404D', 'individual', 'offstage', 4),
  ('f11c549a-f7c4-4cd7-9bc5-c63cb6845ef6'::uuid, 'NOVA-C6C6577AE', 'individual', 'offstage', NULL),
  ('400418f4-b325-46d6-bd95-33cb224b45d5'::uuid, 'PRIME-CE1F05A6C', 'individual', 'offstage', NULL),
  ('7cdf42fc-2670-4339-a08e-d2e45d5d190a'::uuid, 'SPARK-C886A7D4A', 'individual', 'offstage', NULL),
  ('d8aad9fe-fce3-4330-aee5-ef1a147f8e39'::uuid, 'ZENITH-C971F2B70', 'individual', 'offstage', NULL),
  ('710bd79e-2c34-4176-9e8f-4c087c298cbb'::uuid, 'NOVA-C9E19F474', 'individual', 'offstage', 5),
  ('f5fd3411-90c7-4f1c-ae83-f5a63697c973'::uuid, 'PRIME-CE6AB812D', 'individual', 'offstage', 5),
  ('202d97f0-b838-4ace-ad7b-791a0e29ff74'::uuid, 'SPARK-CB702CA75', 'individual', 'offstage', 5),
  ('c3c53780-699f-4bac-8e58-c626b2febad2'::uuid, 'ZENITH-C16FF7375', 'individual', 'offstage', 4),
  ('32f8cfba-6cbf-4220-94d7-9d67821bbb93'::uuid, 'NOVA-C459692BA', 'individual', 'offstage', 5),
  ('95839a75-5bcb-4ff2-81b2-0e9d992c0206'::uuid, 'PRIME-C0C4066AA', 'individual', 'offstage', 5),
  ('de2eb088-57d9-47b9-ae68-166007f9ddac'::uuid, 'SPARK-C1E19CD2B', 'individual', 'offstage', 5),
  ('d4c4265e-4bee-4f44-b955-9661a4472bcf'::uuid, 'ZENITH-C85A74383', 'individual', 'offstage', 4),
  ('7149cafd-0905-4e24-a71c-7c11e14ee755'::uuid, 'NOVA-C41E99AAE', 'individual', 'offstage', 5),
  ('5f69bef3-b963-42c1-b4b9-321df4d8bdb9'::uuid, 'PRIME-C5C5F9580', 'individual', 'offstage', 5),
  ('758da215-651b-4b8e-b65f-efd569f6f1d9'::uuid, 'SPARK-CB1E4713D', 'individual', 'offstage', 5),
  ('97a4011c-b4a8-4e43-b5d6-43a464eb18de'::uuid, 'ZENITH-CA00C8563', 'individual', 'offstage', 4),
  ('e4d6299a-2dfd-41a1-8e68-90b87a39d33d'::uuid, 'NOVA-CF16C5131', 'individual', 'offstage', NULL),
  ('67e8318a-8890-4d8e-b8c8-ab2f88794278'::uuid, 'PRIME-C190BEE07', 'individual', 'offstage', NULL),
  ('1067d516-04e3-4c49-a6e7-4ccf7f36270c'::uuid, 'SPARK-CEDEB42FC', 'individual', 'offstage', NULL),
  ('3deace03-fdf1-4ef9-99a1-392fca20d687'::uuid, 'ZENITH-C75CAC323', 'individual', 'offstage', NULL),
  ('ab46b048-1bbb-489b-9e20-8b01b827ad3f'::uuid, 'NOVA-CDBB28AEA', 'individual', 'offstage', 5),
  ('278872e6-035d-4e6e-8cbc-9a34fc7ce2fa'::uuid, 'PRIME-C302B628B', 'individual', 'offstage', 5),
  ('1cb5a18f-3610-47da-b7df-a36fbe402ea5'::uuid, 'SPARK-C3E035476', 'individual', 'offstage', 5),
  ('ce1c169d-f0c5-48ca-8001-0de9f5eb6845'::uuid, 'ZENITH-CA85CA297', 'individual', 'offstage', 4),
  ('f09d46f7-4eb0-4000-8ad1-dcf3d7c209af'::uuid, 'GENERAL-C00F4F65E', 'individual', 'offstage', 5),
  ('9bdb527f-d0ab-4355-88a4-0531ba2164f1'::uuid, 'GENERAL-C648AD790', 'individual', 'offstage', 5),
  ('7d219e20-272f-4b4d-a378-cacff66a905e'::uuid, 'ZENITH-CE7F015DF', 'group', 'stage', NULL),
  ('129171a7-422b-4d8e-9c39-312c57e7c61c'::uuid, 'SPARK-C9BCBE365', 'individual', 'offstage', 2),
  ('d2958d3f-54a0-45b0-851e-23d44d641411'::uuid, 'GENERAL-CDCAF52D0', 'individual', 'offstage', 5),
  ('5db90769-33d8-4b6e-8c3a-bb31626c4d84'::uuid, 'GENERAL-C91B7AC87', 'group', 'offstage', NULL),
  ('820d9585-7618-492a-9ba5-04628593e4ce'::uuid, 'ZENITH-CDBD639B8', 'individual', 'stage', 1),
  ('43c87a96-a743-4519-b2aa-c87a2ea9afc5'::uuid, 'ZENITH-C15FC6D95', 'group', 'stage', NULL),
  ('4065a4f7-957e-414e-b13e-daaab366fc1a'::uuid, 'GENERAL-C6F552EFA', 'individual', 'offstage', 8),
  ('0abfd88f-8cc8-4308-9d2e-3d473ef9136a'::uuid, 'SPARK-C94BCF846', 'individual', 'stage', 2),
  ('e5ee8d5d-d6ab-4a76-a7f2-6b64b02d7e7b'::uuid, 'GENERAL-CC49D47D5', 'individual', 'offstage', 2),
  ('a2e5d919-26cc-40ca-a25b-c4bb66b9c574'::uuid, 'PRIME-CF9C900CC', 'group', 'stage', NULL),
  ('010ad470-e0c9-422c-875f-2caee8f18262'::uuid, 'PRIME-C7B697E50', 'individual', 'stage', 1),
  ('aa001c2c-12b5-45ee-a499-7542b3ebc999'::uuid, 'GENERAL-CF509588C', 'individual', 'offstage', 6),
  ('1a71a0d7-b354-4187-aa83-78afe0d76bb8'::uuid, 'ZENITH-CA5245CA4', 'individual', 'stage', 2),
  ('b7a43513-01a0-4381-bcc1-1450b4659d34'::uuid, 'ZENITH-CE696CDAC', 'individual', 'stage', 1),
  ('ba38d947-47fb-454c-9452-4e9d21409b25'::uuid, 'GENERAL-C4B77B1F8', 'individual', 'stage', 2),
  ('3b27bead-20b9-43b4-a79c-75096e94d853'::uuid, 'PRIME-C49C4B474', 'individual', 'offstage', 5),
  ('6da7cecd-cf0c-49d5-8188-d5bb60a1f072'::uuid, 'NOVA-CA70A572A', 'individual', 'offstage', 5),
  ('d77fa072-df7a-4fc1-9ee7-c42e67acea85'::uuid, 'GENERAL-CDB2E9F37', 'individual', 'offstage', 4),
  ('e5d93100-c67b-4b0b-a771-b863d5e1db96'::uuid, 'GENERAL-CC95A8DE7', 'individual', 'offstage', 4),
  ('3ebaa44f-9ad6-44ae-887c-72a132b5c55c'::uuid, 'GENERAL-CB8D28D3B', 'group', 'offstage', NULL),
  ('16f3831a-5818-4a0e-b429-2b8b07b99650'::uuid, 'GENERAL-CE41E264D', 'group', 'stage', NULL),
  ('55306716-39f1-4790-89e6-a0b5576a3c24'::uuid, 'NOVA-C0EA684DF', 'individual', 'stage', 1),
  ('b68627fb-e4a9-4093-a7f4-a7dff71356cf'::uuid, 'GENERAL-C13707C51', 'individual', 'offstage', 4),
  ('09a06752-c6d4-4dd4-8bb9-94f26f257d75'::uuid, 'NOVA-CCAA6E2AA', 'individual', 'offstage', 3),
  ('1a1dbeee-9f6b-4bda-aab6-39e3bd1494df'::uuid, 'PRIME-C2EFD987E', 'individual', 'offstage', 3),
  ('670b45ef-2e9d-4ad7-8af9-41b9881c4e9c'::uuid, 'ZENITH-CDD97D6E8', 'individual', 'offstage', 2),
  ('d416079a-b245-4a04-a00a-eaf1cd0e897a'::uuid, 'SPARK-C06721A67', 'individual', 'offstage', 5),
  ('6a3204b5-eba7-4976-af3f-d0dd8ad9108c'::uuid, 'GENERAL-CBF08B7D2', 'group', 'stage', NULL),
  ('84f31083-7ec2-4c75-83ee-c826b2f7ee90'::uuid, 'NOVA-C59D38FB4', 'group', 'stage', NULL),
  ('75d66928-4c2b-4e5a-9a80-c4467d4d5410'::uuid, 'PRIME-C321E98AA', 'individual', 'offstage', 3),
  ('6790ace0-6361-4c66-982a-cd1178d887a7'::uuid, 'NOVA-C114188B3', 'individual', 'offstage', 2),
  ('bd3e5e32-e546-419a-bd65-98964684dde9'::uuid, 'SPARK-C97ED7531', 'individual', 'offstage', 3),
  ('74cfa661-7de4-466e-b3d2-b413f5150b61'::uuid, 'GENERAL-C27B1CF55', 'group', 'offstage', NULL),
  ('60a9c30f-484c-44a4-b283-2dc917508c9a'::uuid, 'GENERAL-C35255952', 'individual', 'offstage', 2),
  ('b0a5c86f-4583-4418-86d1-f4235ab31cd2'::uuid, 'GENERAL-C10E2E890', 'individual', 'offstage', 2),
  ('d89036d6-4e6b-4779-af9c-f371c37367f4'::uuid, 'NOVA-C0CAF7A7A', 'individual', 'offstage', 5),
  ('24efe28f-d34b-44d7-91c2-e2d29ab16da6'::uuid, 'PRIME-C8B66AF73', 'individual', 'offstage', 6),
  ('908343a3-9cfb-48ba-bc37-ea5ea93407ff'::uuid, 'SPARK-CF8561747', 'individual', 'offstage', NULL),
  ('baff0b51-6bff-41a0-9598-09005b36a5fc'::uuid, 'ZENITH-C287DA4FF', 'individual', 'offstage', 7),
  ('ea32ce96-ede2-4251-bc8b-3ac14920e3a6'::uuid, 'NOVA-CE204F455', 'individual', 'offstage', 5),
  ('e648cdb7-b73d-4cdf-8ba4-63623a0a830a'::uuid, 'PRIME-CE2B0710A', 'individual', 'offstage', 8),
  ('fafaca7a-4e67-40ce-b4a4-c0f674ce1468'::uuid, 'SPARK-C36227FC4', 'individual', 'offstage', NULL),
  ('5f005a9a-68ff-400b-839d-8ffb6c673565'::uuid, 'ZENITH-C54039CC1', 'individual', 'offstage', 7),
  ('203b1336-fe9d-4857-89df-64ea32d75c84'::uuid, 'NOVA-C40515FFD', 'individual', 'offstage', 5),
  ('70232075-0e9f-4778-831d-c09e77d592d8'::uuid, 'SPARK-CCDECEEBC', 'individual', 'offstage', 5),
  ('245f9c32-8e45-4444-b487-6bf655a57a22'::uuid, 'NOVA-CEE217F95', 'individual', 'offstage', NULL),
  ('b068d2b8-8e7f-43a2-90b1-f9607f8e4de6'::uuid, 'PRIME-CCF055F25', 'individual', 'offstage', NULL),
  ('33dc5fff-10d9-42d6-a180-5b2e04a298a3'::uuid, 'SPARK-C1DCD5A04', 'individual', 'offstage', NULL),
  ('5c3af2c4-b071-4b18-b810-71eb5e063493'::uuid, 'ZENITH-C571688A5', 'individual', 'offstage', NULL),
  ('17796d48-e28e-43a2-8c5f-6bfaf3082a16'::uuid, 'NOVA-CC7CDAC98', 'individual', 'offstage', 5),
  ('ae2aebb5-af33-4683-8de6-dbb0c7dae1f6'::uuid, 'PRIME-C9BA3366C', 'individual', 'offstage', 8),
  ('0dfb1074-f0af-471b-8d21-35539e7d71e9'::uuid, 'SPARK-C2E7F8EBB', 'individual', 'offstage', NULL),
  ('f613a513-772d-4991-bccd-887ac67bae40'::uuid, 'ZENITH-CB82F4AED', 'individual', 'offstage', 7),
  ('0ba91807-3438-4691-a7c8-4bc0d3a4db37'::uuid, 'SPARK-C07CC41C8', 'individual', 'offstage', NULL),
  ('f2af536a-488d-4a5a-8dbd-99e89b867f74'::uuid, 'GENERAL-C0A666D2C', 'group', 'offstage', NULL),
  ('78bd9ade-d563-47f9-bb8d-c99b49789795'::uuid, 'ZENITH-CDE762736', 'individual', 'offstage', 5),
  ('08126030-68a4-498a-9ee7-45c1cd190f1c'::uuid, 'PRIME-CD4ADA0AB', 'individual', 'offstage', 5),
  ('c959e21e-491d-41ea-8f8b-a4a23ce5cee1'::uuid, 'NOVA-C1D32E7C5', 'individual', 'offstage', 5),
  ('5e836a5e-9874-4c7c-b620-7d52b4151efe'::uuid, 'PRIME-C636011E0', 'individual', 'offstage', 5),
  ('7affc08b-a29f-4ece-b83c-07382d4096a9'::uuid, 'GENERAL-C3AA14BCD', 'group', 'stage', NULL),
  ('008d2637-9ff8-4687-b38d-a48bf773db7e'::uuid, 'GENERAL-CECDC678E', 'individual', 'stage', 2),
  ('556eb1a4-8ffd-4715-9c40-565f6a3f06f4'::uuid, 'NOVA-CB319AC81', 'group', 'stage', NULL),
  ('dcf9920b-0f67-445a-81cc-b65e49de4dac'::uuid, 'NOVA-C7C3253E8', 'individual', 'stage', 2),
  ('1876e5d9-541c-4a53-a8c8-e87a1b4c477b'::uuid, 'PRIME-CA2838C68', 'individual', 'stage', 2),
  ('dc8f8d2c-5949-4be5-a9a6-8abd7f0e64ac'::uuid, 'SPARK-C30033FCA', 'individual', 'stage', 2),
  ('947c5a2b-455a-4493-ad4b-05bf60b04698'::uuid, 'ZENITH-CE492212D', 'individual', 'stage', 2),
  ('94ce6034-ed1b-49ea-a0e4-65cac5c79213'::uuid, 'PRIME-CCD9C417C', 'group', 'stage', NULL),
  ('a2d0bb57-ff5c-4377-9c18-08ff0b53139a'::uuid, 'NOVA-C9B59E6DF', 'individual', 'offstage', 5),
  ('b1a09f5a-7fb9-4f7d-994a-53f88207f627'::uuid, 'NOVA-CB38C18F4', 'individual', 'offstage', 2),
  ('666b486a-0ec3-4732-8aa5-7b92a1b3dae8'::uuid, 'PRIME-CF7A742ED', 'individual', 'offstage', 2),
  ('9eec64d8-0a71-44d5-a322-c3d7d74fbf8a'::uuid, 'SPARK-C7B7AC863', 'individual', 'offstage', 2),
  ('5d497ec6-928f-4119-966b-05562d8f38c2'::uuid, 'ZENITH-CD8B908DA', 'group', 'offstage', NULL),
  ('84b9bd9b-23d7-463c-8552-9f5ac1ca6387'::uuid, 'NOVA-CAC1A3988', 'individual', 'offstage', 2),
  ('85dc7b3e-77b2-49b8-8ce3-388c6d102989'::uuid, 'NOVA-C1C9B925E', 'individual', 'offstage', 5),
  ('2e3c1e9d-e4f0-4acd-9a2e-ca05f5e86794'::uuid, 'NOVA-CAFF1608C', 'individual', 'offstage', 1),
  ('33249cab-0a07-4def-996d-c92be20bbebf'::uuid, 'GENERAL-C49DD22AA', 'individual', 'stage', 2),
  ('744d2eed-fc52-4fdd-8064-8e23239ec7a9'::uuid, 'SPARK-CDC97F92C', 'group', 'stage', NULL),
  ('e0de1cda-3fc5-453f-a553-07a3f0ed0176'::uuid, 'GENERAL-C16D8A137', 'group', 'stage', NULL),
  ('91f81f26-9853-4fa6-908b-e05d2cd75707'::uuid, 'GENERAL-C17B2A1DD', 'individual', 'offstage', 5),
  ('9e512b26-3252-45f0-8eef-8d60e10a148d'::uuid, 'NOVA-C31A20D41', 'individual', 'stage', 2),
  ('8684989a-1ac8-4f51-aa22-6673d056d0c5'::uuid, 'PRIME-CAB9CEC2B', 'individual', 'stage', 2),
  ('32447f2c-bf42-44d3-ac97-44cd8e81b552'::uuid, 'SPARK-C162B44AB', 'individual', 'stage', 2),
  ('53d4a5c6-2c5a-464b-b63d-70cfd599425a'::uuid, 'ZENITH-C9DF98F78', 'individual', 'stage', 2),
  ('b3cc2a91-7da4-414e-9b14-8da8d076a3fd'::uuid, 'NOVA-C389413E8', 'individual', 'stage', 2),
  ('ec74a154-5add-4b05-9592-aaaaa55850c4'::uuid, 'PRIME-CAEEEA0F7', 'individual', 'stage', 2),
  ('01e52e0a-aeaf-41f1-bb88-4594354df0ef'::uuid, 'SPARK-CECD2C29C', 'individual', 'stage', 2),
  ('538bb012-29ee-4a83-ab7d-8a4ab94dc105'::uuid, 'ZENITH-CA4777240', 'individual', 'stage', 2),
  ('bd99dd50-4806-4db4-babb-fc7c11e4ed8a'::uuid, 'NOVA-C979EFA90', 'individual', 'stage', 2),
  ('9a62c056-cdce-425e-99e1-50f34698274b'::uuid, 'PRIME-C7407501F', 'individual', 'stage', 3),
  ('a0d3c25c-a8e7-43dd-b2d8-e3e9baaccfaf'::uuid, 'SPARK-C73DF029E', 'individual', 'stage', 3),
  ('78756fe4-e4aa-40b8-a5fe-9ba6ad9e9f84'::uuid, 'NOVA-C75EA034B', 'individual', 'stage', 1),
  ('9d63dd38-39b3-44e4-9cf7-6200c48b80fe'::uuid, 'NOVA-CEEE4B065', 'individual', 'stage', 2),
  ('d124046e-235c-4f3a-a3ae-371b072e886c'::uuid, 'PRIME-CCB6EC627', 'individual', 'stage', 2),
  ('3e6f25d6-3a63-49d3-b6b7-d1df8d140ea1'::uuid, 'SPARK-C551E9E06', 'individual', 'stage', 2),
  ('11f7dc16-eef6-451a-ae75-03f80167c659'::uuid, 'ZENITH-C922BD14D', 'individual', 'stage', 2),
  ('1525e429-a95b-48bd-9605-117ae35d95c2'::uuid, 'SPARK-CBD4A9CA2', 'individual', 'offstage', 5),
  ('42796c23-ff70-4b38-9fb9-868221656c78'::uuid, 'NOVA-C216EE245', 'group', 'offstage', NULL),
  ('7ae43b9e-480c-4dc1-a1fc-9db3711120e8'::uuid, 'SPARK-C0449D186', 'group', 'offstage', NULL),
  ('dc3d26bc-6257-473b-9cff-80663b4c5aa0'::uuid, 'PRIME-C1CCDDF49', 'group', 'offstage', NULL),
  ('041abf49-c3ed-4921-ac5a-2cf486513922'::uuid, 'NOVA-C7DAC6B79', 'individual', 'offstage', 3),
  ('0fa026f9-a235-4465-8947-33c40788faf7'::uuid, 'SPARK-C8FBE3707', 'individual', 'offstage', 3),
  ('d06ad789-b017-4fed-bf5c-8f55b6dc7a47'::uuid, 'ZENITH-C0A3D6F3B', 'individual', 'stage', 1),
  ('9abcdbdf-60db-4ae4-bb1c-73e4a5339d6f'::uuid, 'PRIME-C017FC3FB', 'individual', 'stage', 1),
  ('6eb8971b-bcaa-474a-ab26-203d942fa395'::uuid, 'ZENITH-CA14586B3', 'individual', 'stage', 1),
  ('bfd22bfd-0e35-4fb4-b945-df98331cceee'::uuid, 'ZENITH-CCBF6C674', 'individual', 'stage', 2),
  ('eb7460b2-902c-4d4a-9098-eedc728d45d2'::uuid, 'SPARK-C60DF3E06', 'individual', 'offstage', 8),
  ('cd6e3ce4-ba65-4751-836a-976e00ae42f3'::uuid, 'NOVA-C261C6E6E', 'individual', 'offstage', 5),
  ('e81dc41f-5311-41e5-bfbb-d418e066d8f0'::uuid, 'PRIME-CA5CC0BC1', 'individual', 'offstage', 2),
  ('dc34f24b-960f-4dfd-879a-328b9328a1c3'::uuid, 'GENERAL-CF9FA602B', 'individual', 'offstage', 2),
  ('d063d16b-06a7-43dc-a8fc-5022f8302910'::uuid, 'GENERAL-C01FC3195', 'individual', 'offstage', 2),
  ('50dbfec9-e762-4132-b11d-f393114bc4db'::uuid, 'ZENITH-C729C2894', 'group', 'offstage', NULL),
  ('eff404cd-8da2-483f-92e1-be9f07124ac0'::uuid, 'PRIME-CD61E8A67', 'individual', 'offstage', 4),
  ('6f5e76d3-9f66-4ff2-9223-b95ca5bdacc0'::uuid, 'PRIME-C1D1B7F71', 'individual', 'stage', 1),
  ('a052dad7-2308-43e3-a75c-9a1d29dd61f8'::uuid, 'GENERAL-CBEFC9013', 'group', 'stage', NULL),
  ('a756f51e-2489-438e-b88e-47ba6f6662de'::uuid, 'SPARK-C2EC49E3E', 'individual', 'offstage', NULL),
  ('92c036f5-28ca-401b-8915-e289c6a90528'::uuid, 'ZENITH-CC8E5BD42', 'individual', 'offstage', 5),
  ('2807e0e1-8ef6-4c9d-a4b7-e7c3ea2fd68a'::uuid, 'NOVA-C93142344', 'individual', 'offstage', 5),
  ('378f4c9b-3c28-4056-8ac6-78a3e817730d'::uuid, 'PRIME-CB4D1C2A5', 'individual', 'offstage', 8),
  ('6bd1c77f-d603-4f19-84cf-a0b20d568c61'::uuid, 'ZENITH-C4AB9360C', 'individual', 'offstage', 5),
  ('bb0bae7c-7581-4193-b360-fd52b7a85f7c'::uuid, 'SPARK-C0C922C38', 'individual', 'offstage', NULL),
  ('8a779b8c-a6a1-4b50-b7ad-fcf03587e7b0'::uuid, 'NOVA-CCB025324', 'individual', 'offstage', 5),
  ('3f62d08b-a094-4aa6-9f08-8ca0c2c8b79f'::uuid, 'PRIME-C6260DFFD', 'individual', 'offstage', 8),
  ('285ff925-e137-413c-8629-01fdfc4e34e9'::uuid, 'GENERAL-C8D2EE9DA', 'individual', 'offstage', 2),
  ('2a742548-a999-4042-a3b8-f437074e50c7'::uuid, 'GENERAL-C09A6BCBA', 'individual', 'offstage', 2),
  ('0ba44961-0ab9-45be-880b-1cf62f93355d'::uuid, 'GENERAL-C274578D1', 'individual', 'offstage', 2),
  ('17cf7248-1983-4d3b-9c0b-658305088d85'::uuid, 'GENERAL-C5463F085', 'individual', 'offstage', 2),
  ('02781208-593a-458e-87cd-93b669eb10f1'::uuid, 'NOVA-C1F2BEEFC', 'individual', 'stage', 2),
  ('73565afc-b9ea-4595-b8dc-537c4b85d46c'::uuid, 'PRIME-CE207BB93', 'individual', 'stage', 3),
  ('bb444b74-aedc-4a63-b453-794ab7f082bb'::uuid, 'SPARK-CBA95C832', 'individual', 'stage', 2),
  ('eb7b5c15-902b-4dc3-8c55-0875e8205769'::uuid, 'GENERAL-C8844D6DD', 'individual', 'offstage', 1),
  ('d1519918-2661-42d4-88f3-56173b5211cd'::uuid, 'GENERAL-C90607618', 'individual', 'offstage', 5),
  ('ad928209-94ef-4105-92b6-3f31514938cd'::uuid, 'GENERAL-CF327EC6F', 'group', 'stage', NULL),
  ('36abd6b2-b225-48d4-a592-9b0cc1b8d5b9'::uuid, 'ZENITH-C2D5017AC', 'individual', 'stage', 1),
  ('1e9bf4ca-32d5-4af7-9ef2-e7b641d182d5'::uuid, 'GENERAL-C583B5C9B', 'individual', 'stage', 2),
  ('dbdd15f5-bc00-448e-873c-36c82760518f'::uuid, 'PRIME-C76D4B88E', 'individual', 'offstage', 4)
) AS s(item_id, item_code, participation_type, item_type, max_participants_per_team);

DO $$
DECLARE
  v_festival uuid := '52f64db0-d58b-4237-b17c-f8b0b68f9597';
  v_tenant uuid := '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM _consolium_item_settings;
  IF v_count <> 211
     OR (SELECT count(DISTINCT item_id) FROM _consolium_item_settings) <> 211
     OR (SELECT count(DISTINCT item_code) FROM _consolium_item_settings) <> 211
  THEN RAISE EXCEPTION 'The reviewed workbook must contain 211 unique items.'; END IF;

  -- Match the Admin editor's festival lock and lock item rows before checking
  -- them, so a concurrent edit cannot be overwritten.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_festival::text, 0));
  PERFORM 1 FROM public.items i
    JOIN _consolium_item_settings s ON s.item_id = i.id
    ORDER BY i.id FOR UPDATE OF i;

  SELECT count(*) INTO v_count
  FROM _consolium_item_settings s
  JOIN public.items i ON i.id = s.item_id
  WHERE i.festival_id = v_festival
    AND i.tenant_id = v_tenant
    AND i.is_active IS TRUE
    AND i.item_code = s.item_code
    AND lower(i.participation_type) = s.participation_type
    AND i.item_type IS NULL
    AND i.max_participants_per_team IS NULL;
  IF v_count <> 211 THEN
    RAISE EXCEPTION 'Festival items changed since workbook review; regenerate settings before applying.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.festival_id = v_festival AND i.tenant_id = v_tenant AND i.is_active IS TRUE
      AND NOT EXISTS (SELECT 1 FROM _consolium_item_settings s WHERE s.item_id = i.id)
  ) THEN
    RAISE EXCEPTION 'The workbook does not cover every active festival item.';
  END IF;

  UPDATE public.items i
  SET item_type = s.item_type,
      max_participants_per_team = s.max_participants_per_team,
      updated_at = clock_timestamp()
  FROM _consolium_item_settings s
  WHERE i.id = s.item_id AND i.festival_id = v_festival AND i.tenant_id = v_tenant;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 211 THEN RAISE EXCEPTION 'Expected 211 item settings; updated %.', v_count; END IF;
END;
$$;

COMMIT;
