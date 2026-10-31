export type ProjectStatus =  
"Pending / Under Review" |"Approved" |"Declined" |"Archived";

export type ProjectFlag = "Funding" | "Human Capital" | "Both";

export type UserRole = "Founders" | "Technical Staff" | "Mentors" | "Admin";

export interface Project {
    id: string;
    projectName: string;
    founderName: string;
    founderEmail: string;
    status: ProjectStatus;
    projectFlag: ProjectFlag;
    score?: number;
    registeredAt: string;
    summary: string;

}
    
export function hasRole(userRoles: UserRole[], targetRole: UserRole): boolean { 
    return userRoles.includes(targetRole); 
}