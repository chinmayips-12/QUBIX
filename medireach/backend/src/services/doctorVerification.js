export async function verifyDoctorRegistration(application) {
  const registryUrl = process.env.MEDICAL_REGISTRY_URL;
  const registryToken = process.env.MEDICAL_REGISTRY_TOKEN;
  if (!registryUrl || !registryToken) {
    return { status: 'Pending', note: 'Official registry is not connected; admin manual review is required.' };
  }

  try {
    const response = await fetch(registryUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${registryToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: application.name,
        registrationNumber: application.councilRegNo,
        medicalCouncil: application.medicalCouncil,
        certificateSha256: application.certificateHash,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { status: 'Pending', note: `Registry returned ${response.status}; admin manual review is required.` };
    }
    const registry = await response.json();
    const matches = registry.verified === true
      && registry.name?.trim().toLowerCase() === application.name.trim().toLowerCase()
      && registry.registrationNumber === application.councilRegNo
      && registry.medicalCouncil?.trim().toLowerCase() === application.medicalCouncil.trim().toLowerCase()
      && registry.certificateSha256 === application.certificateHash;
    return matches
      ? { status: 'Verified', note: 'Registration and certificate matched the configured official registry.' }
      : { status: 'Requires Review/Rejected', note: 'Registry information did not match; admin review is required.' };
  } catch (error) {
    return { status: 'Pending', note: `Registry unavailable (${error.message}); admin manual review is required.` };
  }
}
