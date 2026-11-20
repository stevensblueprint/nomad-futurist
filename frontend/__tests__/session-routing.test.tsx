import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  act,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  fetchAuthSession: vi.fn(),
  signOut: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => {
  const router = { replace: mocks.replace };
  return { useRouter: () => router, usePathname: () => "/" };
});

vi.mock("aws-amplify/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("aws-amplify/utils")>();

  return {
    ...actual,
    Hub: {
      ...actual.Hub,
      listen: vi.fn(() => () => { }),
    },
  };
});

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: () => mocks.fetchAuthSession(),
  signOut: () => mocks.signOut(),
}));

import ProtectedLayout from "../app/(protected)/layout";
import UserPortal from "../app/(protected)/page";
import StartupNews from "../app/(protected)/StartupNews";
import ProjectsPage from "../app/(protected)/projects/page";
import PublicOnly from "../app/components/PublicOnly";
import SignOutButton from "../app/components/SignOutButton";
import { GET as getStartupNews } from "../app/api/startup-news/route";

const signedIn = { tokens: { accessToken: {} } };
const signedOut = { tokens: undefined };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockReset().mockResolvedValue(Response.json({ stories: [] }));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("protected routes", () => {
  it("redirects signed-out users to /sign-in and hides content", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedOut);
    render(<ProtectedLayout><UserPortal /></ProtectedLayout>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByRole("heading", { name: /Welcome back/ })).toBeNull();
  });

  it("keeps My Projects and its task section behind sign-in", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedOut);
    render(<ProtectedLayout><ProjectsPage /></ProtectedLayout>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
    expect(screen.queryByRole("heading", { name: "My projects" })).toBeNull();
    expect(screen.queryByText("Competitive analysis · In progress")).toBeNull();
  });

  it("shows content to signed-in users without redirecting", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    render(<ProtectedLayout><p>secret</p></ProtectedLayout>);
    expect(await screen.findByText("secret")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not redirect or show content while loading", () => {
    mocks.fetchAuthSession.mockReturnValue(new Promise(() => { }));
    render(<ProtectedLayout><p>secret</p></ProtectedLayout>);
    expect(screen.queryByText("secret")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("user portal", () => {
  it("shows the signed-in founder’s portal with project navigation and sign out", async () => {
    mocks.fetchAuthSession.mockResolvedValue({
      tokens: {
        accessToken: {},
        idToken: { payload: { name: "Alex Kim", "cognito:groups": ["Founders"] } },
      },
    });
    mocks.signOut.mockResolvedValue(undefined);
    render(<ProtectedLayout><UserPortal /></ProtectedLayout>);

    expect(await screen.findByRole("heading", { name: "Welcome back, Alex." })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "My projects" }).every((link) => link.getAttribute("href") === "/projects")).toBe(true);
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link", { name: /Register another project/ }).every((link) => link.getAttribute("href") === "/registration")).toBe(true);
    expect(within(main).getByRole("link", { name: /International Energy Agency/ })).toHaveAttribute("href", expect.stringContaining("iea.org"));
    expect(within(main).getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/projects#sample-project-tasks");

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("combines the category and sample project filters and lets the user clear the project", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    render(<ProtectedLayout><UserPortal /></ProtectedLayout>);

    const news = await screen.findByRole("button", { name: "News" });
    expect(screen.getByText("Data Center Sustainability Analyst")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Register project" })).toBeNull();
    fireEvent.click(news);
    expect(news).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Data Center Sustainability Analyst")).toBeNull();
    expect(await screen.findByText("Turning waste heat into a useful resource")).toBeTruthy();
    expect(screen.getByText("No current stories match this topic. Showing sample briefings.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "EdgeLoop" } });
    expect(await screen.findByText("Taking edge infrastructure closer to the customer")).toBeTruthy();
    expect(mocks.fetch).toHaveBeenLastCalledWith("/api/startup-news?topic=edge-computing", expect.anything());
    expect(screen.queryByText("Edge Systems Engineer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));
    expect(screen.getByText("Edge Systems Engineer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear project filter" }));
    expect(screen.getByLabelText("Project")).toHaveValue("");
    expect(screen.getByText("Data Center Sustainability Analyst")).toBeTruthy();
  });

  it("shows loading, then attributed news and publisher links", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    let finish!: (response: Response) => void;
    mocks.fetch.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    render(<ProtectedLayout><UserPortal /></ProtectedLayout>);

    expect(await screen.findByText("Loading startup news…")).toBeTruthy();
    expect(screen.getByText("Data Center Sustainability Analyst")).toBeTruthy();
    finish(Response.json({
      stories: [{
        id: "123",
        title: "An infrastructure startup expands",
        url: "https://publisher.example/startup",
        publisher: "publisher.example",
        postedAt: "2026-11-17T00:00:00.000Z",
      }],
    }));
    expect(await screen.findByRole("heading", { name: "An infrastructure startup expands" })).toBeTruthy();
    expect(screen.getByText(/publisher.example/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Read the article/ })).toHaveAttribute("href", "https://publisher.example/startup");
    expect(screen.getByRole("link", { name: "Hacker News discussion" })).toHaveAttribute("href", "https://news.ycombinator.com/item?id=123");
    expect(screen.queryByText("What liquid cooling changes for early-stage founders")).toBeNull();
  });

  it("shows sample stories during a news outage and lets the user retry", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(<ProtectedLayout><UserPortal /></ProtectedLayout>);

    const retry = await screen.findByRole("button", { name: "Retry news" });
    expect(screen.getByText("What liquid cooling changes for early-stage founders")).toBeTruthy();
    fireEvent.click(retry);
    expect(await screen.findByText("No current stories match this topic. Showing sample briefings.")).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back if the news request stalls", () => {
    vi.useFakeTimers();
    try {
      mocks.fetch.mockReturnValue(new Promise<Response>(() => {}));
      render(<StartupNews topic="startups" limit={1} fallback={<p>Sample briefing</p>} />);
      expect(screen.getByText("Loading startup news…")).toBeTruthy();

      act(() => vi.advanceTimersByTime(8000));
      expect(screen.getByText("Sample briefing")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Retry news" })).toBeTruthy();
      expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders a protected My Projects destination with a link back to the portal", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    render(<ProtectedLayout><ProjectsPage /></ProtectedLayout>);

    expect(await screen.findByRole("heading", { name: "My projects" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "EdgeLoop tasks" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the portal" })).toHaveAttribute("href", "/");
  });
});

describe("public routes", () => {
  it("redirects signed-in users to /", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    render(<PublicOnly><p>form</p></PublicOnly>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("form")).toBeNull();
  });

  it("shows the form to signed-out users", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedOut);
    render(<PublicOnly><p>form</p></PublicOnly>);
    expect(await screen.findByText("form")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("startup news API", () => {
  it("returns unique publisher links and rejects unsafe URLs", async () => {
    const hit = {
      objectID: "123",
      title: "An edge computing platform launches",
      url: "https://www.publisher.example/startup",
      created_at: "2026-11-17T12:00:00.000Z",
    };
    mocks.fetch.mockResolvedValue(Response.json({
      hits: [
        hit,
        { ...hit, objectID: "124" },
        { ...hit, objectID: "125", url: "javascript:alert(1)" },
        { ...hit, objectID: "126", created_at: "invalid" },
        { ...hit, objectID: "127", title: "Unrelated headline", url: "https://publisher.example/unrelated" },
      ],
    }));

    const response = await getStartupNews(new Request("http://localhost/api/startup-news?topic=edge-computing"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=900");
    expect(await response.json()).toEqual({
      stories: [{
        id: "123",
        title: hit.title,
        url: hit.url,
        publisher: "publisher.example",
        postedAt: hit.created_at,
      }],
    });
    const [upstream] = mocks.fetch.mock.calls[0];
    expect(upstream.hostname).toBe("hn.algolia.com");
    expect(upstream.searchParams.get("query")).toBe("edge computing");
  });

  it("rejects unknown topics and returns an uncached error for provider failures", async () => {
    const rejected = await getStartupNews(new Request("http://localhost/api/startup-news?topic=unknown"));
    expect(rejected.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();

    mocks.fetch.mockResolvedValue(new Response(null, { status: 429 }));
    const unavailable = await getStartupNews(new Request("http://localhost/api/startup-news"));
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("sign out", () => {
  it("calls signOut once on double-click, then redirects to /sign-in", async () => {
    let finish!: () => void;
    mocks.signOut.mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<SignOutButton />);

    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("shows an error and allows retry when signOut fails", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("network"));
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
