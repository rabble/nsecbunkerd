/**
 * Registration Validation Module
 * 
 * Handles validation of new user registrations.
 * Validates:
 * - Username uniqueness
 * - Password strength
 * - Email format and uniqueness
 */

import prisma from "../../db";

/**
 * Validates a new user registration request
 * @param request - The registration request
 * @param record - The existing request record
 * @throws Error if validation fails
 */
export async function validateRegistration(request, record) {
    const body = request.body;
    const { username, domain, email, password } = body;

    // Check username uniqueness
    const userRecord = await prisma.user.findUnique({
        where: { username, domain }
    });

    if (userRecord) {
        throw new Error("Username already exists. If this is your account, please login instead.");
    }

    // Validate password strength
    if (password.length < 8) {
        throw new Error("Password is too short");
    }

    // Validate email if provided
    if (email) {
        if (!email.includes("@")) {
            throw new Error("Invalid email address");
        }

        // Check email uniqueness
        const emailRecord = await prisma.user.findFirst({ where: { email } });
        if (emailRecord) {
            throw new Error("Email already exists");
        }
    }
}